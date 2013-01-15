// vim:set ts=4:vim modeline
//
//	JCBookmark専用HTTPサーバ
//
//	ファイル文字コード:UTF-8 (じゃないとブラウザで文字化け)
//
//	VC2008コマンドラインビルド。いろいろコマンドがあるようだ。
//	- devenv   (Visual Studioぜんぶ用？)
//	- msbuild
//	- vcbuild  (VC用？)
//	http://blogs.msdn.com/b/vcblog/archive/2010/01/11/vcbuild-vs-c-msbuild-on-the-command-line.aspx
//	vcbuildがいちばん引数簡単で楽かな…。
//	>vcvarsall.bat
//	>vcbuild JCBookmark.sln				(ソリューション全体)
//	>vcbuild JCBookmark.vcproj			(プロジェクト指定)
//	>vcbuild JCBookmark.vcproj Release	(Releaseのみ)
//	>vcbuild JCBookmark.vcproj Debug	(Debugのみ)
//
//	TODO:Chromeみたいな自動バージョンアップ機能をつけるには？旧exeと新exeがあってどうやって入れ替えるの？
//	TODO:WinHTTPつかえばOpenSSLいらない？
//	TODO:strlenのコスト削減でこんな構造体を使うとよいのか…？
//	[C言語で文字列を簡単にかつ少し高速に操作する]
//	http://d.hatena.ne.jp/htz/20090222/1235322977
//	TODO:ログがいっぱい出るとListBoxのメモリ使用量が気になるのでログレベルの設定を作るべきか。
//	「ログなし」「普通」「大量」
//	TODO:通信相手が途中で死んだとき切断されずゾンビ接続になってしまったことがあったけど再現が難しいようだ。
//	ゾンビが溜まって最大同時接続数になると新規接続もできなかった。発生したらどうすんの？一定時間無通信だっ
//	たら切断するとか監視しないとダメ？クライアントバッファに時刻メンバを持たせて、最後の処理時刻を格納して
//	おき、1秒毎のメモリ表示タイミングで、その処理時刻から1分とか時間が経ってたら無通信と判断して切断する？
//	TODO:スタック使用量が気になる・・
//	http://yabooo.org/archives/65
//	http://okwave.jp/qa/q1099230.html
//	http://technet.microsoft.com/ja-jp/windows/mark_04.aspx
//	TODO:ログの検索、ListBoxは完全一致か前方一致検索しかできない？(LB_FINDSTRING/LB_FINDSTRINGEXACT)
//	全部LB_GETTEXTして自力検索すればいいか。でも一致部分だけ反転表示とかできないとショボいし…。
//	TODO:ログ文字列を選択コピーできるようにする簡単な手はないものか…
//	EDITコントロール(含むリッチエディット)はプログラムから行追加とかできないようだし…
//	TODO:0.0.0.0でListenする→インターネット公開→SSLでListenする→パスワード認証たいへん後回し
//
#pragma comment(lib,"gdi32.lib")
#pragma comment(lib,"user32.lib")
#pragma comment(lib,"ws2_32.lib")
#pragma comment(lib,"shell32.lib")
#pragma comment(lib,"winmm.lib")
#pragma comment(lib,"comctl32.lib")
#pragma comment(lib,"wininet.lib")
#pragma comment(lib,"shlwapi.lib")
#pragma comment(lib,"psapi.lib")
#pragma comment(lib,"libeay32.lib")
#pragma comment(lib,"ssleay32.lib")
// 非ユニコード(Lなし)文字列リテラルをUTF-8でexeに格納する#pragma。
// KB980263を適用しないと有効にならない。Expressには正式リリースされていない
// hotfixにも見えるが、ググって非公式サイトからexeダウンロードして適用したら
// 期待通り動作した。いいのかなダメかな・・。
#pragma execution_character_set("utf-8")
// うざいC4996警告無視
#pragma warning(disable:4996)

#include <winsock2.h>
#include <ws2tcpip.h>
#include <shellapi.h>
#include <process.h>
#include <mmsystem.h>
#include <commctrl.h>
#include <wininet.h>
#include <shlwapi.h>
#include <psapi.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdarg.h>
#include "sqlite3.h"
#include "openssl/ssl.h"
#include "openssl/rand.h"

#define		WM_SOCKET			WM_APP			// ソケットイベントメッセージ
#define		WM_TRAYICON			(WM_APP+1)		// タスクトレイクリックメッセージ
#define		WM_CREATE_AFTER		(WM_APP+2)		// WM_CREATE後に1回実行するメッセージ
#define		WM_SETTING_OK		(WM_APP+3)		// 設定ダイアログOK後の処理
#define		WM_TABSELECT		(WM_APP+4)		// 設定ダイアログ初期表示タブのためのメッセージ
#define		MAINFORMNAME		L"MainForm"
#define		CONFIGDIALOGNAME	L"ConfigDialog"
#define		APPNAME				L"JCBookmark v1.3"

typedef struct {
	u_char*		buf;				// リクエスト受信バッファ
	u_char*		method;				// GET/PUT
	u_char*		path;				// パス
	u_char*		param;				// パラメータ
	u_char*		ver;				// HTTPバージョン
	u_char*		head;				// HTTPヘッダ開始位置
	u_char*		ContentType;		// Content-Type
	u_char*		UserAgent;			// User-Agent
	u_char*		IfModifiedSince;	// If-Modified-Since
	u_char*		body;				// リクエストボディ開始位置
	u_char*		boundary;			// Content-Type:multipart/form-dataのboundary
	HANDLE		writefh;			// 書出ファイルハンドル
	DWORD		wrote;				// 書出済みバイト
	UINT		ContentLength;		// Content-Length値
	UINT		bytes;				// 受信バッファ有効バイト
	size_t		bufsize;			// 受信バッファサイズ
} Request;

typedef struct {
	u_char*		buf;				// レスポンス送信バッファ
	HANDLE		readfh;				// 送信ファイルハンドル
	DWORD		readed;				// 送信ファイル読込済みバイト
	UINT		sended;				// 送信済みバイト
	UINT		bytes;				// 送信バッファ有効バイト
	size_t		bufsize;			// 送信バッファサイズ
} Response;

typedef struct TClient {
	SOCKET		sock;				// クライアント接続ソケット
	UINT		status;				// 接続状態フラグ
	#define		CLIENT_ACCEPT_OK	1	// accept完了
	#define		CLIENT_RECV_MORE	2	// 受信中
	#define		CLIENT_SEND_READY	3	// 送信準備完了
	#define		CLIENT_SENDING		4	// 送信中
	#define		CLIENT_THREADING	5	// スレッド処理中
	Request		req;
	Response	rsp;
	HANDLE		thread;
	u_char		abort;				// 中断フラグ
} TClient;

HWND		MainForm			=NULL;				// メインフォームハンドル
HWND		ListBox				=NULL;				// リストボックスハンドル
HDC			ListBoxDC			=NULL;				// リストボックスデバイスコンテキスト
LONG		ListBoxWidth		=0;					// リストボックス横幅
HICON		TrayIcon			=NULL;				// タスクトレイアイコン
SOCKET		ListenSock			=INVALID_SOCKET;	// Listenソケット
u_char		ListenPort[8]		="10080";			// Listenポート
WCHAR		wListenPort[8]		=L"10080";			// Listenポート
#define		CLIENT_MAX			16					// クライアント最大同時接続数
TClient		Client[CLIENT_MAX]	={0};				// クライアント
WCHAR*		DocumentRoot		=NULL;				// ドキュメントルートフルパス
size_t		DocumentRootLen		=0;					// wcslen(DocumentRoot)
SSL_CTX*	ssl_ctx				=NULL;				// OpenSSL
#define		TIMER1000			1000				// タイマーイベントID
HANDLE		ThisProcess			=NULL;				// 自プロセスハンドル
HANDLE		Heap				=NULL;				// GetProcessHeap()

// WM_COMMANDのLOWORD(wp)に入るID
#define CMD_EXIT		1		// ポップアップメニュー終了
#define CMD_SETTING		2		// ポップアップメニュー設定
#define CMD_LOGSAVE		3		// ポップアップメニューログ保存
#define CMD_LOGCLEAR	4		// ポップアップメニューログ消去
#define CMD_IE			10		// IEボタン
#define CMD_CHROME		11		// Chromeボタン
#define CMD_FIREFOX		12		// Firefoxボタン
#define CMD_OPERA		13		// Operaボタン
#define CMD_USER1		14		// ユーザ指定ブラウザ1
#define CMD_USER2		15		// ユーザ指定ブラウザ2
#define CMD_USER3		16		// ユーザ指定ブラウザ3
#define CMD_USER4		17		// ユーザ指定ブラウザ4

#define MEMLOG
#ifdef MEMLOG
//
// 自力メモリリークチェック用ログ生成
// memory.log に確保アドレス＋ソース行数と解放アドレスを記録する。
// スクリプト memory.pl でログから解放漏れを検出。
//   >perl memory.pl < memory.log
//
// memory.log の例
//   +00F56B20:malloc(102):.\JCBookmark.c:450
//   +00F58C10:malloc(18):.\JCBookmark.c:453
//   -00F56B20
//   -00F58C10
// 
FILE* mlog=NULL;
void mlogopen( void )
{
	WCHAR log[MAX_PATH+1]=L"";
	WCHAR* p;
	GetModuleFileNameW( NULL, log, sizeof(log)/sizeof(WCHAR) );
	p = wcsrchr(log,L'\\');
	if( p ){
		wcscpy( p+1, L"memory.log" );
		mlog = _wfopen( log, L"wb" );
	}
}
SIZE_T PF( void )
{
	if( ThisProcess ){
		PROCESS_MEMORY_COUNTERS pmc;
		memset( &pmc, 0, sizeof(pmc) );
		if( GetProcessMemoryInfo( ThisProcess, &pmc, sizeof(pmc) ) )
			return pmc.PagefileUsage /1024;	// KB
	}
	return 0;
}
void* mymalloc( size_t size, UINT line )
{
	void* p = HeapAlloc( Heap, HEAP_ZERO_MEMORY, size );
	if( !mlog ) mlogopen();
	if( mlog && p ) fprintf(mlog,"+%p:L%u:malloc(%u) (%ukb)\r\n",p,line,size,PF());
	return p;
}
void myfree( void* p, UINT line )
{
	HeapFree( Heap, 0, p );
	if( !mlog ) mlogopen();
	if( mlog ) fprintf(mlog,"-%p:L%u (%ukb)\r\n",p,line,PF());
}
char* mystrdup( LPCSTR str, UINT line )
{
	size_t size = strlen(str)+1;
	char* p = (char*)mymalloc( size, line );
	memcpy( p, str, size );
	return p;
}
WCHAR* mywcsdup( LPCWSTR wstr, UINT line )
{
	size_t size = (wcslen(wstr)+1)*sizeof(WCHAR);
	WCHAR* p = (WCHAR*)mymalloc( size, line );
	memcpy( p, wstr, size );
	return p;
}
FILE* myfopen( LPCSTR path, LPCSTR mode, UINT line )
{
	FILE* fp = fopen( path, mode );
	if( !mlog ) mlogopen();
	if( mlog && fp ) fprintf(mlog,"+%p:L%u:fopen(%s) (%ukb)\r\n",fp,line,path,PF());
	return fp;
}
FILE* mywfopen( LPCWSTR path, const WCHAR* mode, UINT line )
{
	FILE* fp = _wfopen( path, mode );
	if( !mlog ) mlogopen();
	if( mlog && fp ) fprintf(mlog,"+%p:L%u:_wfopen(?) (%ukb)\r\n",fp,line,PF());
	return fp;
}
int myfclose( FILE* fp, UINT line )
{
	if( !mlog ) mlogopen();
	if( mlog ) fprintf(mlog,"-%p:L%u (%ukb)\r\n",fp,line,PF());
	return fclose( fp );
}
HANDLE myCreateFileW( LPCWSTR path, DWORD access, DWORD mode, LPSECURITY_ATTRIBUTES sec, DWORD disp, DWORD attr, HANDLE templete, UINT line )
{
	HANDLE handle = CreateFileW( path, access, mode, sec, disp, attr, templete );
	if( !mlog ) mlogopen();
	if( mlog && handle!=INVALID_HANDLE_VALUE )
		fprintf(mlog,"+%p:L%u:CreateFileW(?) (%ukb)\r\n",handle,line,PF());
	return handle;
}
BOOL myCloseHandle( HANDLE handle, UINT line )
{
	if( !mlog ) mlogopen();
	if( mlog ) fprintf(mlog,"-%p:L%u (%ukb)\r\n",handle,line,PF());
	return CloseHandle( handle );
}
UINT myExtractIconExW( LPCWSTR path, int index, HICON* iconL, HICON* iconS, UINT n, UINT line )
{
	UINT ret = ExtractIconExW( path, index, iconL, iconS, n );
	if( !mlog ) mlogopen();
	if( mlog && ret ){
		if( iconL && *iconL ) fprintf(mlog,"+%p:L%u:ExtractIconExW(?) (%ukb)\r\n",*iconL,line,PF());
		if( iconS && *iconS ) fprintf(mlog,"+%p:L%u:ExtractIconExW(?) (%ukb)\r\n",*iconS,line,PF());
	}
	return ret;
}
HICON myExtractAssociatedIconW( HINSTANCE hinst, LPWSTR path, LPWORD index, UINT line )
{
	HICON icon = ExtractAssociatedIconW( hinst, path, index );
	if( !mlog ) mlogopen();
	if( mlog && icon ) fprintf(mlog,"+%p:L%u:ExtractAssociatedIconW(?) (%ukb)\r\n",icon,line,PF());
	return icon;
}
DWORD_PTR mySHGetFileInfoW( LPCWSTR path, DWORD attr, SHFILEINFOW* info, UINT byte, UINT flag, UINT line )
{
	DWORD_PTR ret = SHGetFileInfoW( path, attr, info, byte, flag );
	if( mlog && ret && info && info->hIcon )
		fprintf(mlog,"+%p:L%u:SHGetFileInfoW(?) (%ukb)\r\n",info->hIcon,line,PF());
	return ret;
}
BOOL myDestroyIcon( HICON icon, UINT line )
{
	if( !mlog ) mlogopen();
	if( mlog ) fprintf(mlog,"-%p:L%u (%ukb)\r\n",icon,line,PF());
	return DestroyIcon( icon );
}
#define malloc(a) mymalloc(a,__LINE__)
#define strdup(a) mystrdup(a,__LINE__)
#define wcsdup(a) mywcsdup(a,__LINE__)
#define free(a) myfree(a,__LINE__)
#define fopen(a,b) myfopen(a,b,__LINE__)
#define _wfopen(a,b) mywfopen(a,b,__LINE__)
#define fclose(a) myfclose(a,__LINE__)
#define CreateFileW(a,b,c,d,e,f,g) myCreateFileW(a,b,c,d,e,f,g,__LINE__)
#define CloseHandle(a) myCloseHandle(a,__LINE__)
#define ExtractIconExW(a,b,c,d,e) myExtractIconExW(a,b,c,d,e,__LINE__)
#define ExtractAssociatedIconW(a,b,c) myExtractAssociatedIconW(a,b,c,__LINE__)
#define SHGetFileInfoW(a,b,c,d,e) mySHGetFileInfoW(a,b,c,d,e,__LINE__)
#define DestroyIcon(a) myDestroyIcon(a,__LINE__)
#else // MEMLOG
char* mystrdup( LPCSTR str )
{
	size_t size = strlen(str)+1;
	char* p = (char*)HeapAlloc( Heap, HEAP_ZERO_MEMORY, size );
	if( p ) memcpy( p, str, size );
	return p;
}
WCHAR* mywcsdup( LPCWSTR wstr )
{
	size_t size = (wcslen(wstr)+1) *sizeof(WCHAR);
	WCHAR* p = (WCHAR*)HeapAlloc( Heap, HEAP_ZERO_MEMORY, size );
	if( p ) memcpy( p, wstr, size );
	return p;
}
#define malloc(a) HeapAlloc(Heap,HEAP_ZERO_MEMORY,a)
#define strdup(a) mystrdup(a)
#define wcsdup(a) mywcsdup(a)
#define free(a) HeapFree(Heap,0,a)
#endif // MEMLOG

void ErrorBoxA( const u_char* fmt, ... )
{
	u_char msg[256];
	WCHAR wstr[256];
	va_list arg;

	va_start( arg, fmt );
	_vsnprintf( msg, sizeof(msg), fmt, arg );
	va_end( arg );

	msg[sizeof(msg)-1] = '\0';

	MultiByteToWideChar( CP_UTF8, 0, msg, -1, wstr, sizeof(wstr)/sizeof(WCHAR) );
	MessageBoxW( MainForm, wstr, L"エラー", MB_ICONERROR );
}
void ErrorBoxW( const WCHAR* fmt, ... )
{
	WCHAR msg[256];
	va_list arg;

	va_start( arg, fmt );
	_vsnwprintf( msg, sizeof(msg)/sizeof(WCHAR), fmt, arg );
	va_end( arg );

	msg[sizeof(msg)/sizeof(WCHAR)-1] = L'\0';

	MessageBoxW( MainForm, msg, L"エラー", MB_ICONERROR );
}

void CRLFtoSPACE( u_char* s )
{
	if( s ) for( ; *s; s++ ) if( *s=='\n' || *s=='\r' ) *s=' ';
}
void CRLFtoSPACEW( WCHAR* s )
{
	if( s ) for( ; *s; s++ ) if( *s==L'\n' || *s==L'\r' ) *s=L' ';
}

u_char* chomp( u_char* s )
{
	if( s ){
		u_char* p;
		for( p=s; *p; p++ ){
			if( *p=='\r' || *p=='\n' ){
				*p = '\0';
				break;
			}
		}
	}
	return s;
}
WCHAR* chompw( WCHAR* s )
{
	if( s ){
		WCHAR* p;
		for( p=s; *p; p++ ){
			if( *p==L'\r' || *p==L'\n' ){
				*p = L'\0';
				break;
			}
		}
	}
	return s;
}

//
// HTTPログ。一旦メモリに溜めておき、1秒毎のWM_TIMERでListBoxにSendMessageする。
// はじめは毎回ListBoxにSendMessageしていたが、ワーカースレッドの終了待ちをメインスレッドの
// 関数内でループ＋Sleepで待ってみたところ、なぜかワーカースレッドも停止。どうやらログ出力＝
// ListBoxへのSendMessageで止まってフリーズしてしまう感じ。そりゃそうかメインスレッドでビジー
// ループしてたらメッセージが処理できない。というわけでスレッドの実行を止めないようメモリに
// キャッシュ。結果、同時接続負荷がかかるとウィンドウの反応が悪くなるが、HTTPサーバとしての
// スループットは向上したようだ。
//
typedef struct LogCache {
	struct LogCache*	next;				// 単方向リスト
	WCHAR				text[1];			// ログメッセージ１つ(可変長文字列)
} LogCache;

LogCache*			LogCache0	=NULL;		// リスト先頭
LogCache*			LogCacheN	=NULL;		// リスト末尾
CRITICAL_SECTION	LogCacheCS	={0};		// スレッド間排他
#define				LOGMAX		512			// １ログメッセージ文字数上限(上限なし実装が面倒なだけ)

// ログメッセージ１つメモリキャッシュ
void LogCacheAdd( const WCHAR* text )
{
	size_t len = wcslen( text );
	size_t bytes = len *sizeof(WCHAR);
	LogCache* lc = (LogCache*)malloc( sizeof(LogCache) +bytes );
	if( lc ){
		memcpy( lc->text, text, bytes );
		lc->text[len] = L'\0';
		lc->next = NULL;
		// リスト末尾追加
		EnterCriticalSection( &LogCacheCS );
		if( LogCacheN )
			LogCacheN->next = lc;
		LogCacheN = lc;
		if( !LogCache0 )
			LogCache0 = lc;
		LeaveCriticalSection( &LogCacheCS );
	}
}
void LogW( const WCHAR* fmt, ... )
{
	WCHAR		wstr[LOGMAX]=L"";
	va_list		arg;
	SYSTEMTIME	st;
	int			len;

	GetLocalTime( &st );
	len =_snwprintf( wstr,LOGMAX,L"%02d:%02d:%02d.%03d ",
					st.wHour, st.wMinute, st.wSecond, st.wMilliseconds );

	va_start( arg, fmt );
	_vsnwprintf( wstr+len, LOGMAX-len, fmt, arg );
	va_end( arg );

	wstr[LOGMAX-1] = L'\0';
	CRLFtoSPACEW( wstr );
	LogCacheAdd( wstr );
}
void LogA( const u_char* fmt, ... )
{
	u_char		msg[LOGMAX]="";
	WCHAR		wstr[LOGMAX]=L"";
	va_list		arg;
	SYSTEMTIME	st;
	int			len;

	GetLocalTime( &st );
	len =_snprintf( msg,sizeof(msg),"%02d:%02d:%02d.%03d ",
					st.wHour, st.wMinute, st.wSecond, st.wMilliseconds );

	va_start( arg, fmt );
	_vsnprintf( msg+len, sizeof(msg)-len, fmt, arg );
	va_end( arg );

	msg[sizeof(msg)-1] = '\0';
	CRLFtoSPACE( msg );
	MultiByteToWideChar( CP_UTF8, 0, msg, -1, wstr, LOGMAX );
	LogCacheAdd( wstr );
}

u_char* WideCharToUTF8alloc( const WCHAR* wstr )
{
	if( wstr ){
		int bytes = WideCharToMultiByte(CP_UTF8, 0, wstr, -1, NULL, 0, NULL, NULL);
		u_char* utf8 = (u_char*)malloc(bytes);
		if( utf8 ){
			if( WideCharToMultiByte(CP_UTF8, 0, wstr, -1, utf8, bytes, NULL, NULL) !=0 ){
				// 成功
				return utf8;
			}
			LogW(L"Unicode→UTF8変換エラー");
			free( utf8 );
		}
		else LogW(L"L%u:malloc(%u)エラー",__LINE__,bytes);
	}
	return NULL;
}
WCHAR* UTF8toWideCharAlloc( const u_char* utf8 )
{
	if( utf8 ){
		int count = MultiByteToWideChar( CP_UTF8, 0, utf8, -1, NULL, 0 );
		WCHAR* wstr = (WCHAR*)malloc( (count+1) *sizeof(WCHAR) );
		if( wstr ){
			if( MultiByteToWideChar( CP_UTF8, 0, utf8, -1, wstr, count ) !=0 ){
				// 成功
				wstr[count] = L'\0';
				return wstr;
			}
			LogW(L"UTF8→Unicode変換エラー");
			free( wstr );
		}
		else LogW(L"L%u:malloc(%u)エラー",__LINE__,(count+1)*sizeof(WCHAR));
	}
	return NULL;
}
// 文字列連結wcsdup
WCHAR* wcsjoin( const WCHAR* s1, const WCHAR* s2 )
{
	if( s1 && s2 ){
		size_t len1 = wcslen( s1 );
		size_t len2 = wcslen( s2 );
		WCHAR* ss = (WCHAR*)malloc( (len1 + len2 + 1) *sizeof(WCHAR) );
		if( ss ){
			memcpy( ss, s1, len1 *sizeof(WCHAR) );
			memcpy( ss + len1, s2, len2 *sizeof(WCHAR) );
			ss[len1+len2] = L'\0';
		}
		else LogW(L"L%u:mallocエラー",__LINE__);
		return ss;
	}
	return NULL;
}


// ブラウザ起動ボタン
#define BUTTON_WIDTH	36		// ボタン縦横ピクセル
// ブラウザインデックス
#define BI_IE			0		// IE
#define BI_CHROME		1		// Chrome
#define BI_FIREFOX		2		// Firefox
#define BI_OPERA		3		// Opera
#define BI_USER1		4		// ユーザ指定ブラウザ1
#define BI_USER2		5		// ユーザ指定ブラウザ2
#define BI_USER3		6		// ユーザ指定ブラウザ3
#define BI_USER4		7		// ユーザ指定ブラウザ4
#define BI_COUNT		8
// ブラウザインデックスからブラウザボタンコマンドIDに変換
#define BrowserCommand(i)	((i)+CMD_IE)
// ブラウザボタンコマンドIDからブラウザインデックスに変換
#define CommandBrowser(i)	((i)-CMD_IE)

typedef struct {
	WCHAR*		name;			// 名前("IE","Chrome"など)
	WCHAR*		exe;			// exeフルパス
	WCHAR*		arg;			// 引数
	BOOL		hide;			// 表示しない
} BrowserInfo;

typedef struct {
	HWND		hwnd;			// ウィンドウハンドル
	HICON		icon;			// アイコンハンドル
} BrowserIcon;

WCHAR* RegValueAlloc( HKEY topkey, WCHAR* subkey, WCHAR* name )
{
	WCHAR* value = NULL;
	BOOL ok = FALSE;
	HKEY key;
	if( RegOpenKeyExW( topkey, subkey, 0, KEY_READ, &key )==ERROR_SUCCESS ){
		DWORD type, bytes;
		// データバイト数取得(終端NULL含む)
		if( RegQueryValueExW( key, name, NULL, &type, NULL, &bytes )==ERROR_SUCCESS ){
			// バッファ確保
			value = (WCHAR*)malloc( bytes );
			if( value ){
				DWORD realbytes = bytes;
				// データ取得
				if( RegQueryValueExW( key, name, NULL, &type, (BYTE*)value, &realbytes )==ERROR_SUCCESS ){
					if( bytes==realbytes ){
						ok = TRUE;
					}
					else LogW(L"RegQueryValueExW(%s)エラー？",value);
				}
				else LogW(L"RegQueryValueExW(%s)エラー(%u)",subkey,GetLastError());
			}
			else LogW(L"L%u:mallocエラー",__LINE__);
		}
		else LogW(L"RegQueryValueExW(%s)エラー",subkey);
		// レジストリ閉じる
		RegCloseKey( key );
	}
	//else LogW(L"RegOpenKeyExW(%s)エラー",subkey);

	if( !ok && value ) free(value),value=NULL;
	return value;
}
// レジストリキーDefaultIconからブラウザEXEパス取得
WCHAR* RegDefaultIconValueAlloc( HKEY topkey, WCHAR* subkey )
{
	WCHAR* exe = RegValueAlloc( topkey, subkey, NULL );
	if( exe ){
		// 最後の「,数値」とダブルクォート削除
		WCHAR *p = wcsrchr(exe,L',');
		if( p ){
			*p-- = L'\0';
			if( *p==L'"') *p = L'\0';
		}
		if( *exe==L'"') memmove( exe, exe+1, (wcslen(exe)+1)*sizeof(WCHAR) );
	}
	return exe;
}
// レジストリキーApp PathsからブラウザEXEパス取得
WCHAR* RegAppPathValueAlloc( HKEY topkey, WCHAR* subkey )
{
	WCHAR* exe = RegValueAlloc( topkey, subkey, NULL );
	if( exe ){
		// ダブルクォート削除
		WCHAR *p = wcsrchr(exe,L'"');
		if( p ) *p = L'\0';
		if( *exe==L'"') memmove( exe, exe+1, (wcslen(exe)+1)*sizeof(WCHAR) );
	}
	return exe;
}
// 設定ファイル(my.ini)パス取得
WCHAR* ConfigFilePath( void )
{
	WCHAR* path = (WCHAR*)malloc( (MAX_PATH+1)*sizeof(WCHAR) );
	if( path ){
		WCHAR* p;
		GetModuleFileNameW( NULL, path, MAX_PATH );
		path[MAX_PATH] = L'\0';
		p = wcsrchr(path,L'\\');
		if( p ){
			wcscpy( p+1, L"my.ini" );
			return path;
		}
	}
	if( path ) free( path );
	return NULL;
}
// ブラウザ情報をレジストリや設定ファイルからまとめて取得
BrowserInfo* BrowserInfoAlloc( void )
{
	BrowserInfo* br = (BrowserInfo*)malloc( sizeof(BrowserInfo)*BI_COUNT );
	if( br ){
		WCHAR* ini;
		memset( br, 0, sizeof(BrowserInfo)*BI_COUNT );
		// 既定ブラウザ名
		br[BI_IE].name		= L"IE";
		br[BI_CHROME].name	= L"Chrome";
		br[BI_FIREFOX].name = L"Firefox";
		br[BI_OPERA].name	= L"Opera";
		// 既定ブラウザEXEパス
		br[BI_IE].exe = RegDefaultIconValueAlloc(
			// TODO:IE(iexplore.exe)パス取得レジストリはどれが適切？
			// HKEY_CLASSES_ROOT\Applications\iexplore.exe\shell\open\command
			// HKEY_LOCAL_MACHINE\SOFTWARE\Classes\Applications\iexplore.exe\shell\open\command
			// HKEY_LOCAL_MACHINE\SOFTWARE\Clients\StartMenuInternet\IEXPLORE.EXE\DefaultIcon
			// HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\IEXPLORE.EXE
			// HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\ie7
			// HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\ie8
			HKEY_LOCAL_MACHINE
			,L"SOFTWARE\\Clients\\StartMenuInternet\\IEXPLORE.EXE\\DefaultIcon" // C:\Program Files\Internet Explorer\iexplore.exe,-7
		);
		br[BI_CHROME].exe = RegAppPathValueAlloc(
			// TODO:chrome.exeパス取得のためのレジストリはどれが適切？
			// Chromeを何回か再インストールしてたら1.が使えなくなったので5.に変更。
			// 1.HKEY_CLASSES_ROOT\ChromeHTML\DefaultIcon
			// 2.HKEY_LOCAL_MACHINE\SOFTWARE\Classes\ChromeHTML\DefaultIcon
			// 3.HKEY_LOCAL_MACHINE\SOFTWARE\Clients\StartMenuInternet\Google Chrome\DefaultIcon
			// 4.HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Uninstall\Google Chrome\DisplayIcon
			// 5.HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe
			HKEY_LOCAL_MACHINE
			,L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe"
		);
		br[BI_FIREFOX].exe = RegAppPathValueAlloc(
			// TODO:firefox.exeのパスは？複数バージョン存在する場合がある？
			// HKEY_CLASSES_ROOT\FirefoxHTML\DefaultIcon
			// HKEY_CLASSES_ROOT\FirefoxURL\DefaultIcon
			// HKEY_LOCAL_MACHINE\SOFTWARE\Classes\FirefoxHTML\DefaultIcon
			// HKEY_LOCAL_MACHINE\SOFTWARE\Classes\FirefoxURL\DefaultIcon
			// HKEY_LOCAL_MACHINE\SOFTWARE\Clients\StartMenuInternet\FIREFOX.EXE\DefaultIcon
			// HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\firefox.exe
			HKEY_LOCAL_MACHINE
			,L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\firefox.exe"
		);
		br[BI_OPERA].exe = RegDefaultIconValueAlloc(
			// TODO:Opera？
			// HKEY_CLASSES_ROOT\Opera.Extension\DefaultIcon
			// HKEY_CLASSES_ROOT\Opera.HTML\DefaultIcon
			// HKEY_LOCAL_MACHINE\SOFTWARE\Classes\Opera.Extension\DefaultIcon
			// HKEY_LOCAL_MACHINE\SOFTWARE\Classes\Opera.HTML\DefaultIcon
			// HKEY_LOCAL_MACHINE\SOFTWARE\Clients\StartMenuInternet\Opera\DefaultIcon
			// HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\Opera.exe
			HKEY_CLASSES_ROOT
			,L"Opera.HTML\\DefaultIcon" // "D:\Program\Opera\Opera.exe",1
		);
		// 既定ブラウザ引数とユーザ指定ブラウザ
		ini = ConfigFilePath();
		if( ini ){
			FILE* fp = _wfopen(ini,L"rb");
			if( fp ){
				u_char buf[1024];
				while( fgets(buf,sizeof(buf),fp) ){
					chomp(buf);
					if( strnicmp(buf,"IEArg=",6)==0 && *(buf+6) ){
						br[BI_IE].arg = UTF8toWideCharAlloc(buf+6);
					}
					else if( strnicmp(buf,"ChromeArg=",10)==0 && *(buf+10) ){
						br[BI_CHROME].arg = UTF8toWideCharAlloc(buf+10);
					}
					else if( strnicmp(buf,"FirefoxArg=",11)==0 && *(buf+11) ){
						br[BI_FIREFOX].arg = UTF8toWideCharAlloc(buf+11);
					}
					else if( strnicmp(buf,"OperaArg=",9)==0 && *(buf+9) ){
						br[BI_OPERA].arg = UTF8toWideCharAlloc(buf+9);
					}
					else if( strnicmp(buf,"IEHide=",7)==0 && *(buf+7) ){
						br[BI_IE].hide = atoi(buf+7)?TRUE:FALSE;
					}
					else if( strnicmp(buf,"ChromeHide=",11)==0 && *(buf+11) ){
						br[BI_CHROME].hide = atoi(buf+11)?TRUE:FALSE;
					}
					else if( strnicmp(buf,"FirefoxHide=",12)==0 && *(buf+12) ){
						br[BI_FIREFOX].hide = atoi(buf+12)?TRUE:FALSE;
					}
					else if( strnicmp(buf,"OperaHide=",10)==0 && *(buf+10) ){
						br[BI_OPERA].hide = atoi(buf+10)?TRUE:FALSE;
					}
					else if( strnicmp(buf,"Exe1=",5)==0 && *(buf+5) ){
						br[BI_USER1].exe = UTF8toWideCharAlloc(buf+5);
					}
					else if( strnicmp(buf,"Exe2=",5)==0 && *(buf+5) ){
						br[BI_USER2].exe = UTF8toWideCharAlloc(buf+5);
					}
					else if( strnicmp(buf,"Exe3=",5)==0 && *(buf+5) ){
						br[BI_USER3].exe = UTF8toWideCharAlloc(buf+5);
					}
					else if( strnicmp(buf,"Exe4=",5)==0 && *(buf+5) ){
						br[BI_USER4].exe = UTF8toWideCharAlloc(buf+5);
					}
					else if( strnicmp(buf,"Arg1=",5)==0 && *(buf+5) ){
						br[BI_USER1].arg = UTF8toWideCharAlloc(buf+5);
					}
					else if( strnicmp(buf,"Arg2=",5)==0 && *(buf+5) ){
						br[BI_USER2].arg = UTF8toWideCharAlloc(buf+5);
					}
					else if( strnicmp(buf,"Arg3=",5)==0 && *(buf+5) ){
						br[BI_USER3].arg = UTF8toWideCharAlloc(buf+5);
					}
					else if( strnicmp(buf,"Arg4=",5)==0 && *(buf+5) ){
						br[BI_USER4].arg = UTF8toWideCharAlloc(buf+5);
					}
					else if( strnicmp(buf,"Hide1=",6)==0 && *(buf+6) ){
						br[BI_USER1].hide = atoi(buf+6)?TRUE:FALSE;
					}
					else if( strnicmp(buf,"Hide2=",6)==0 && *(buf+6) ){
						br[BI_USER2].hide = atoi(buf+6)?TRUE:FALSE;
					}
					else if( strnicmp(buf,"Hide3=",6)==0 && *(buf+6) ){
						br[BI_USER3].hide = atoi(buf+6)?TRUE:FALSE;
					}
					else if( strnicmp(buf,"Hide4=",6)==0 && *(buf+6) ){
						br[BI_USER4].hide = atoi(buf+6)?TRUE:FALSE;
					}
				}
				fclose( fp );
			}
			free( ini );
		}
		// ユーザ指定ブラウザ名
		br[BI_USER1].name = br[BI_USER1].exe? PathFindFileNameW(br[BI_USER1].exe) : L"1";
		br[BI_USER2].name = br[BI_USER2].exe? PathFindFileNameW(br[BI_USER2].exe) : L"2";
		br[BI_USER3].name = br[BI_USER3].exe? PathFindFileNameW(br[BI_USER3].exe) : L"3";
		br[BI_USER4].name = br[BI_USER4].exe? PathFindFileNameW(br[BI_USER4].exe) : L"4";
	}
	return br;
}
void BrowserInfoFree( BrowserInfo br[BI_COUNT] )
{
	UINT i;
	for( i=0; i<BI_COUNT; i++ ){
		if( br[i].exe ) free( br[i].exe );
		if( br[i].arg ) free( br[i].arg );
	}
	free( br );
}
// 自身のフォルダに移動する
BOOL SetCurrentDirectorySelf( void )
{
	WCHAR dir[MAX_PATH+1]=L"";
	WCHAR* bs;
	BOOL ok;
	GetModuleFileNameW( NULL, dir, sizeof(dir)/sizeof(WCHAR) );
	bs = wcsrchr( dir, L'\\' );
	if( bs ) *bs = L'\0';
	ok = SetCurrentDirectoryW( dir );
	if( !ok ) LogW(L"SetCurrentDirectory(%s)エラー%u",dir,GetLastError());
	return ok;
}

// パスを解決する
// "chrome"だけでも実行できるShellExecuteの機能を取り入れるための自力パス解決。
// アイコン表示とShellExecute実行可否を確実に揃えるためどちらも同じパス解決を行う。
// 以下の入力に対応する。
// 1. 絶対パス
// 2. 絶対パス(拡張子なし)
// 3. 環境変数入り絶対パス(%windir%など)
// 4. 相対パス(自身のフォルダから)
// 5. 環境変数PATHの実行ファイル名
// 6. レジストリAppPath登録アプリ名("chrome"など)
// * 4～6の優先順位は並びの通り4.を優先する。
// * レジストリAppPathは自力参照する。
//   Application Registration (Windows)
//   http://msdn.microsoft.com/en-us/library/windows/desktop/ee872121(v=vs.85).aspx
//   拡張子がない場合は.exeを補完する。
// * 相対パスと環境変数PATHからの検索は、SearchPath/FindExecutable関数を使う。
// * FindExecutable関数は、"a.txt"を渡したら"notepad"が返ってくるという関連付けまで参照する
//   (このアプリには不要な機能)が、拡張子がない場合は、exe/bat/cmd等の実行形式ファイルを探
//   してくれるので、拡張子がない入力に用いる。ただし.lnkは実行形式とみなされず無視のもよう。
//   拡張子がないファイルが実際に存在しても(実行不能なためか)無視される。
// * SearchPath関数は、拡張子は補わない。拡張子がある場合はこの関数を用いる。
WCHAR* PathResolve( const WCHAR* path )
{
	WCHAR* realpath = NULL;
	if( path ){
		// 環境変数(%windir%など)展開
		DWORD length = ExpandEnvironmentStringsW( path, NULL, 0 );
		WCHAR* path2 = (WCHAR*)malloc( length * sizeof(WCHAR) );
		if( path2 ){
			ExpandEnvironmentStringsW( path, path2, length );
			if( PathIsRelativeW(path2) ){
				// 相対パス
				WCHAR dir[MAX_PATH+1]=L"";
				GetCurrentDirectoryW( sizeof(dir)/sizeof(WCHAR), dir );
				if( SetCurrentDirectorySelf() ){
					// 自身のディレクトリおよび環境変数PATHから検索
					WCHAR* ext = wcsrchr(path2,L'.');
					realpath = (WCHAR*)malloc( (MAX_PATH+1)*sizeof(WCHAR) );
					if( realpath ){
						*realpath = L'\0';
						if( !ext ) FindExecutableW( path2, NULL, realpath );
						if( !*realpath ) SearchPathW( NULL, path2, NULL, MAX_PATH, realpath, NULL );
						if( !*realpath ) free( realpath ), realpath=NULL;
					}
					else LogW(L"L%u:mallocエラー",__LINE__);

					if( !realpath && PathIsFileSpecW(path2) ){
						// パス区切り(:\)なし、レジストリ App Paths 自力参照
						// HKEY_CURRENT_USER 優先、HKEY_LOCAL_MACHINE が後
						#define APP_PATH L"Microsoft\\Windows\\CurrentVersion\\App Paths"
						WCHAR key[MAX_PATH+1];
						WCHAR* value;
						_snwprintf(key,sizeof(key),L"Software\\%s\\%s",APP_PATH,path2);
						value = RegAppPathValueAlloc( HKEY_CURRENT_USER, key );
						if( value ){
							if( wcsicmp(path2,PathFindFileNameW(value))==0 ) realpath=value;
							else free( value );
						}
						if( !realpath ){
							_snwprintf(key,sizeof(key),L"SOFTWARE\\%s\\%s",APP_PATH,path2);
							value = RegAppPathValueAlloc( HKEY_LOCAL_MACHINE, key );
							if( value ){
								if( wcsicmp(path2,PathFindFileNameW(value))==0 ) realpath=value;
								else free( value );
							}
						}
						if( !realpath && !ext ){
							// ドット(拡張子)なしの場合は .exe 補完(chrome→chrome.exe)
							WCHAR* exe = wcsjoin( path2, L".exe" );
							if( exe ){
								_snwprintf(key,sizeof(key),L"Software\\%s\\%s",APP_PATH,exe);
								value = RegAppPathValueAlloc( HKEY_CURRENT_USER, key );
								if( value ){
									if( wcsicmp(exe,PathFindFileNameW(value))==0 ) realpath=value;
									else free( value );
								}
								if( !realpath ){
									_snwprintf(key,sizeof(key),L"SOFTWARE\\%s\\%s",APP_PATH,exe);
									value = RegAppPathValueAlloc( HKEY_LOCAL_MACHINE, key );
									if( value ){
										if( wcsicmp(exe,PathFindFileNameW(value))==0 ) realpath=value;
										else free( value );
									}
								}
								free( exe );
							}
							else LogW(L"L%u:wcsjoinエラー",__LINE__);
						}
					}
					if( !realpath ) LogW(L"%s が見つかりません",path);
					SetCurrentDirectoryW( dir );
				}
				else ;// SetCurrentDirectoryエラー
			}
			else{
				// 絶対パス
				if( PathFileExists( path2 ) ){
					realpath = wcsdup( path2 );
					if( !realpath ) LogW(L"L%u:wcsdupエラー",__LINE__);
				}
				else{
					realpath = (WCHAR*)malloc( (MAX_PATH+1)*sizeof(WCHAR) );
					if( realpath ){
						*realpath = L'\0';
						FindExecutableW( path2, NULL, realpath );
						if( !*realpath ){
							LogW(L"%s が見つかりません",path);
							free( realpath ), realpath=NULL;
						}
					}
					else LogW(L"L%u:mallocエラー",__LINE__);
				}
			}
			free( path2 );
		}
		else LogW(L"L%u:mallocエラー",__LINE__);
	}
	return realpath;
}
// ファイルのアイコン取得
// 実行ファイルからアイコンを取り出す
// http://hp.vector.co.jp/authors/VA016117/rsrc2icon.html
// 実行可能ファイルからのアイコンの抽出
// http://pf-j.sakura.ne.jp/program/tips/extrcicn.htm
HICON FileIconLoad( const WCHAR* path )
{
	HICON icon = NULL;
	if( path ){
		WCHAR* realpath = PathResolve( path );
		if( realpath ){
			if( !ExtractIconExW( realpath, 0, &icon, NULL, 1 ) || !icon ){
				// ExtractIconはexeやdllはよいが、ショートカット(.lnk)のアイコンは取得できない。
				// ExtractAssociatedIcon/SHGetFileInfoで取得できるが、PF使用量が7-800KBも増える。
				// (wscript.exeのアイコンがなぜかエラーアイコンになったりする謎もある)
				// PF使用量は削減したいが、COMのIShellLinkインタフェースはコード量がやたら多く却下。
				// LoadResource/CreateIconFromResourceExはちょっと違うかな？
				//  　http://bbs.wankuma.com/index.cgi?mode=al2&namber=62203&KLOG=104
				// ということでPF使用量削減は難しそう。
				// SHDefExtractIconというXP以降の新しい関数があるようだが、よくわからんのでスルー。
				SHFILEINFOW info;
				if( !SHGetFileInfoW( realpath, 0, &info, sizeof(info), SHGFI_ICON |SHGFI_LARGEICON ) || !info.hIcon ){
					// ExtractAssociatedIconは"chrome"という文字列を渡しても成功するが、
					// それが引き金でアクセス違反が発生したり謎なので却下。詳細不明。
					//WORD index = 0;
					//icon = ExtractAssociatedIconW( GetModuleHandle(NULL), realpath, &index );
					//if( !icon ){
						// アイコン取得できない時は標準アプリアイコンを返す
						// http://msdn.microsoft.com/en-us/library/windows/desktop/bb762149(v=vs.85).aspx
						// DestroyIconするため標準アイコンをCopyIconしておく。
						// 似たようなDuplicateIconもあるけどCopyIconでいいかなきっと…
						LogW(L"\"%s\"のアイコンを取得できません",realpath);
						icon = CopyIcon( LoadIcon(NULL,IDI_APPLICATION) );
					//}
				}
				else icon = info.hIcon;
			}
			free( realpath );
		}
	}
	return icon;
}
// 待受ポートを設定ファイルからグローバル変数に読込
void ListenPortGet( void )
{
	WCHAR* ini = ConfigFilePath();
	if( ini ){
		FILE* fp = _wfopen(ini,L"rb");
		if( fp ){
			u_char buf[1024];
			while( fgets(buf,sizeof(buf),fp) ){
				chomp(buf);
				if( strnicmp(buf,"ListenPort=",11)==0 && *(buf+11) ){
					strncpy( ListenPort, buf+11, sizeof(ListenPort) );
					ListenPort[sizeof(ListenPort)-1]='\0';
					MultiByteToWideChar( CP_UTF8, 0, ListenPort, -1, wListenPort, sizeof(wListenPort)/sizeof(WCHAR) );
				}
			}
			fclose(fp);
		}
		free( ini );
	}
}

void ConfigSave( WCHAR* wListenPort, WCHAR* wExe[BI_COUNT], WCHAR* wArg[BI_COUNT], BOOL hide[BI_COUNT] )
{
	WCHAR new[MAX_PATH+1]=L"";
	WCHAR* p;
	GetModuleFileNameW( NULL, new, sizeof(new)/sizeof(WCHAR) );
	p = wcsrchr(new,L'\\');
	if( p ){
		// my.ini.new 作成
		FILE* fp;
		wcscpy( p+1, L"my.ini.new" );
		fp = _wfopen(new,L"wb");
		if( fp ){
			u_char* listenPort = WideCharToUTF8alloc( wListenPort );
			u_char* exe[BI_COUNT], *arg[BI_COUNT];
			WCHAR ini[MAX_PATH+1]=L"";
			UINT i;
			for( i=0; i<BI_COUNT; i++ ){
				exe[i] = WideCharToUTF8alloc( wExe[i] );
				arg[i] = WideCharToUTF8alloc( wArg[i] );
			}
			fprintf(fp,"ListenPort=%s\r\n",	listenPort		?listenPort:"");
			fprintf(fp,"IEArg=%s\r\n",		arg[BI_IE]		?arg[BI_IE]:"");
			fprintf(fp,"IEHide=%s\r\n",		hide[BI_IE]		?"1":"");
			fprintf(fp,"ChromeArg=%s\r\n",	arg[BI_CHROME]	?arg[BI_CHROME]:"");
			fprintf(fp,"ChromeHide=%s\r\n",	hide[BI_CHROME]	?"1":"");
			fprintf(fp,"FirefoxArg=%s\r\n",	arg[BI_FIREFOX]	?arg[BI_FIREFOX]:"");
			fprintf(fp,"FirefoxHide=%s\r\n",hide[BI_FIREFOX]?"1":"");
			fprintf(fp,"OperaArg=%s\r\n",	arg[BI_OPERA]	?arg[BI_OPERA]:"");
			fprintf(fp,"OperaHide=%s\r\n",	hide[BI_OPERA]	?"1":"");
			for( i=BI_USER1; i<BI_COUNT; i++ ){
				fprintf(fp,"Exe%u=%s\r\n",i-BI_USER1+1,exe[i]?exe[i]:"");
				fprintf(fp,"Arg%u=%s\r\n",i-BI_USER1+1,arg[i]?arg[i]:"");
				fprintf(fp,"Hide%u=%s\r\n",i-BI_USER1+1,hide[i]?"1":"");
			}
			if( listenPort ) free( listenPort );
			for( i=0; i<BI_COUNT; i++ ){
				if( exe[i] ) free( exe[i] );
				if( arg[i] ) free( arg[i] );
			}
			fclose(fp);
			// my.ini.new -> my.ini
			wcscpy( ini, new );
			ini[wcslen(ini)-4]=L'\0';
			if( !MoveFileExW( new, ini ,MOVEFILE_REPLACE_EXISTING |MOVEFILE_WRITE_THROUGH ))
				LogW(L"MoveFileEx(%s)エラー%u",new,GetLastError());
		}
		else LogW(L"fopen(%s)エラー",new);
	}
}

#define Num(p) ( (p)? (p) - Client : -1 )

TClient* ClientOfSocket( SOCKET sock )
{
	UINT i;
	for( i=0; i<CLIENT_MAX; i++ ){
		if( Client[i].sock==sock ) return &(Client[i]);
	}
	return NULL;
}

void ClientInit( TClient* cp )
{
	if( cp ){
		memset( cp, 0, sizeof(TClient) );
		cp->sock = INVALID_SOCKET;
		cp->req.writefh = INVALID_HANDLE_VALUE;
		cp->rsp.readfh = INVALID_HANDLE_VALUE;
	}
}

WCHAR* ClientTempPath( TClient* cp, WCHAR* path, size_t size )
{
	_snwprintf(path,size,L"%s\\$%u",DocumentRoot,Num(cp));
	path[size-1]=L'\0';
	return path;
}

void ClientShutdown( TClient* cp )
{
	WCHAR wpath[MAX_PATH+1]=L"";
	if( cp ){
		CloseHandle( cp->thread );
		if( cp->sock !=INVALID_SOCKET ){
			shutdown( cp->sock, SD_BOTH );
			closesocket( cp->sock );
		}
		CloseHandle( cp->req.writefh );
		CloseHandle( cp->rsp.readfh );
		if( cp->req.buf ){
			free( cp->req.buf );
		}
		if( cp->rsp.buf ){
			free( cp->rsp.buf );
		}
		DeleteFileW( ClientTempPath(cp,wpath,sizeof(wpath)/sizeof(WCHAR)) );
		ClientInit( cp );
	}
}

void ClientSend( TClient* cp, u_char* data, size_t len )
{
	Response* rsp = &(cp->rsp);
	size_t need = rsp->bytes + len;
	if( need > rsp->bufsize ){
		// バッファ拡大
		u_char* newbuf;
		size_t newsize = rsp->bufsize * 2;
		while( need > newsize ){ newsize *= 2; }
		newbuf = (u_char*)malloc( newsize );
		if( newbuf ){
			memcpy( newbuf, rsp->buf, rsp->bytes );
			free( rsp->buf );
			rsp->buf = newbuf;
			rsp->bufsize = newsize;
			LogW(L"[%u]送信バッファ拡大%ubytes",Num(cp),newsize);
		}
		else{
			LogW(L"[%u]mallocエラー送信データ破棄",Num(cp));
			return;
		}
	}
	memcpy( rsp->buf + rsp->bytes, data, len );
	rsp->bytes += len;
}

#define ClientSends(cp,msg) ClientSend(cp,msg,strlen(msg))

void ClientSendf( TClient* cp, u_char* fmt, ... )
{
	u_char msg[256];
	va_list arg;

	msg[sizeof(msg)-1]='\0';

	va_start( arg, fmt );
	_vsnprintf( msg, sizeof(msg), fmt, arg );
	va_end( arg );

	if( msg[sizeof(msg)-1]=='\0' ){
		ClientSends( cp, msg );
	}
	else{
		// バッファ不足ヒープ使う
		size_t bufsiz = 512;
		u_char* buf = (u_char*)malloc( bufsiz );
		if( buf ){
		retry:
			buf[bufsiz-1]='\0';

			va_start( arg, fmt );
			_vsnprintf( buf, bufsiz, fmt, arg );
			va_end( arg );

			if( buf[bufsiz-1]=='\0' ){
				LogW(L"L%u:スタック不足ヒープ確保%ubytes",__LINE__,bufsiz);
				ClientSends( cp, buf );
				free( buf );
			}
			else{
				free( buf );
				bufsiz += bufsiz;	// 2倍
				buf = (u_char*)malloc( bufsiz );
				if( buf ){
					goto retry;
				}
				else LogW(L"[%u]malloc(%u)エラー送信データ破棄",Num(cp),bufsiz);
			}
		}
	}
}

#define ClientSendErr(p,s) ClientSendf(p,"HTTP/1.0 %s\r\n\r\n<head><title>%s</title></head><body>%s</body>",s,s,s)

//
// FILETIME値(1601/1/1からの100ナノ秒単位の値)をJavaScript.Date.getTime(1970/1/1からのミリ秒)に
// 変換する。Win32:FILETIMEは1601/1/1からの100ナノ秒単位の値、中身はUINT64値で、書式 %I64u で
// 出力すると例えば 129917516702250000 の 18桁。JavaScript.Date.getTimeは1970/1/1からのミリ秒で、
// 例えば 1347278204225 の 13桁。以下サイトを参考に、
//   [UNIX の time_t を Win32 FILETIME または SYSTEMTIME に変換するには]
//   http://support.microsoft.com/kb/167296/ja
// 1. 116444736000000000(たぶん1601-1970の100ナノ秒単位の値)を引く。
// 2. 10000で割る＝100ナノ秒単位からミリ秒に。
//
UINT64 FileTimeToJSTime( const FILETIME* ft )
{
	return (*(UINT64*)ft -116444736000000000) /10000;
}
//
// 現在時刻のJavaScript.Date.getTime値を返却
//
UINT64 JSTime( void )
{
	FILETIME ft;
	GetSystemTimeAsFileTime( &ft );
	return FileTimeToJSTime( &ft );
}




//---------------------------------------------------------------------------------------------------------------
// IEお気に入りJSONイメージ作成
// IEお気に入りフォルダ(Favorites)パス取得
// * 参考サイト
//		http://www.wa.commufa.jp/~exd/contents/backup/01002.html
//		http://www.atmarkit.co.jp/fwin2k/win2ktips/612chgfavor/chgfavor.html
//		http://q.hatena.ne.jp/mobile/1337861911
//		http://pasofaq.jp/windows/mycomputer/7usershellfolders.htm
// * レジストリキー
//		HKEY_CURRENT_USER
//			\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders
//   エントリ Favorites にフォルダパスが入ってる。規定値は
//		%USERPROFILE%\Favorites
// * %USERPROFILE% は環境変数で、たとえば以下の値
//		C:\Documents and Settings\user
// * 環境変数取得(展開)関数は、
//		getenv / GetEnvironmentVariable / ExpandEnvironmentStrings
//   の3つくらいかな。
// TODO:SHGetSpecialFolderPath/SHGetFolderPath(CSIDL_FAVORITES)でもいい？簡単？
// でもバッファサイズ指定がない嫌なAPIである。
WCHAR* FavoritesPathAlloc( void )
{
	WCHAR* path = NULL;
	WCHAR* subkey = L"Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders";
	HKEY key;

	if( RegOpenKeyExW( HKEY_CURRENT_USER, subkey, 0, KEY_READ, &key )==ERROR_SUCCESS ){
		WCHAR* name = L"Favorites";
		DWORD type, bytes;
		// データサイズ取得(終端NULL含む)
		if( RegQueryValueExW( key, name, NULL, &type, NULL, &bytes )==ERROR_SUCCESS ){
			WCHAR* value = (WCHAR*)malloc( bytes );
			if( value ){
				// データ取得
				if( RegQueryValueExW( key, name, NULL, &type, (BYTE*)value, &bytes )==ERROR_SUCCESS ){
					// 環境変数(%USERPROFILE%)展開後の文字数(終端NULL含む)取得
					DWORD length = ExpandEnvironmentStringsW( value, NULL, 0 );
					path = (WCHAR*)malloc( length *sizeof(WCHAR) );
					if( path ){
						ExpandEnvironmentStringsW( value, path, length ); // 環境変数展開
					}
					else LogW(L"L%u:malloc(%u)エラー",__LINE__,length*sizeof(WCHAR));
				}
				else LogW(L"RegQueryValueExW(%s)エラー%u",subkey,GetLastError());
				free( value );
			}
			else LogW(L"L%u:malloc(%u)エラー",__LINE__,bytes);
		}
		else LogW(L"RegQueryValueExW(%s)エラー%u",subkey,GetLastError());
		RegCloseKey( key );
	}
	else LogW(L"RegOpenKeyExW(%s)エラー",subkey);
	return path;
}
// Favoritesフォルダ内を検索してノードリスト(単方向チェーン)を生成
typedef struct NodeList {
	struct NodeList*	next;		// 次ノード
	struct NodeList*	child;		// 子ノード
	BOOL				isFolder;	// フォルダかどうか
	DWORD				sortIndex;	// ソートインデックス
	UINT64				dateAdded;	// 作成日
	WCHAR*				name;		// 名前(ファイル/フォルダ名)
	//u_char*				title;		// タイトル
	u_char*				url;		// サイトURL
	u_char*				icon;		// favicon URL
} NodeList;
// 全ノード破棄
void NodeListDestroy( NodeList* node )
{
	while( node ){
		NodeList* next = node->next;
		if( node->child ) NodeListDestroy( node->child );
		free( node );
		node = next;
	}
}
// ノード１つメモリ確保
NodeList* NodeCreate( const WCHAR* name, u_char* url, u_char* icon )
{
	NodeList* node = NULL;
	size_t namesize=0, urlsize=0, iconsize=0;
	size_t bytes = sizeof(NodeList);
	if( name ){
		namesize = (wcslen(name) + 1) * sizeof(WCHAR);
		bytes += namesize;
		//LogW(L"NodeCreate:%s",name);
	}
	else LogW(L"NodeCreate empty name. bug???");
	if( url ){
		urlsize = strlen(url) + 1;
		bytes += urlsize;
	}
	if( icon ){
		iconsize = strlen(icon) + 1;
		bytes += iconsize;
	}
	node = (NodeList*)malloc( bytes );
	if( node ){
		BYTE* p = (BYTE*)(node+1);
		node->sortIndex = UINT_MAX;
		if( name ){
			memcpy(p,name,namesize);
			node->name = (WCHAR*)p;
			p += namesize;
		}
		if( url ){
			memcpy(p,url,urlsize);
			node->url = (u_char*)p;
			p += urlsize;
		}
		if( icon ){
			memcpy(p,icon,iconsize);
			node->icon = (u_char*)p;
			p += iconsize;
		}
	}
	else LogW(L"L%u:mallocエラー",__LINE__);
	return node;
}

NodeList* FolderFavoriteListCreate( const WCHAR* wdir )
{
	NodeList* folder = NULL;
	size_t wdirlen = wcslen(wdir);
	WCHAR* wfindir = (WCHAR*)malloc( (wdirlen +3) *sizeof(WCHAR) );
	if( wfindir ){
		HANDLE handle;
		WIN32_FIND_DATAW wfd;
		_snwprintf(wfindir,wdirlen+3,L"%s\\*",wdir);
		handle = FindFirstFileW( wfindir, &wfd );
		if( handle !=INVALID_HANDLE_VALUE ){
			// フォルダノード
			folder = NodeCreate( wcsrchr(wdir,L'\\')+1, NULL, NULL );
			if( folder ){
				NodeList* last = NULL;
				folder->isFolder = TRUE;
				do{
					if( wcscmp(wfd.cFileName,L"..") && wcscmp(wfd.cFileName,L".") ){
						size_t wpathlen = wdirlen + wcslen(wfd.cFileName) + 2;
						WCHAR *wpath = (WCHAR*)malloc( wpathlen *sizeof(WCHAR) );
						if( wpath ){
							NodeList* node = NULL;
							_snwprintf(wpath,wpathlen,L"%s\\%s",wdir,wfd.cFileName);
							if( wfd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY ){
								// ディレクトリ再帰
								node = FolderFavoriteListCreate( wpath );
							}
							else{
								// ファイル
								WCHAR* dot = wcsrchr( wfd.cFileName, L'.' );
								if( dot && wcsicmp(dot+1,L"URL")==0 ){
									// 拡張子url
									u_char *url=NULL, *icon=NULL;
									FILE* fp = _wfopen( wpath, L"rb" );
									if( fp ){
										u_char line[1024];
										while( fgets( line, sizeof(line), fp ) ){
											if( strnicmp(line,"URL=",4)==0 ){
												url = strdup(chomp(line+4));
												if( !url ) LogW(L"L%u:strdupエラー",__LINE__);
												else if( icon ) break;
											}
											else if( strnicmp(line,"IconFile=",9)==0 ){
												icon = strdup(chomp(line+9));
												if( !icon ) LogW(L"L%u:strdupエラー",__LINE__);
												else if( url ) break;
											}
										}
										fclose( fp );
									}
									else LogW(L"fopen(%s)エラー",wpath);
									// URLノード生成
									node = NodeCreate( wfd.cFileName, url, icon );
									if( url ) free( url );
									if( icon ) free( icon );
								}
							}
							// ノードリスト末尾に登録
							if( node ){
								node->dateAdded = FileTimeToJSTime(&wfd.ftCreationTime);
								if( last ){
									last->next = node;
									last = node;
								}
								else folder->child = last = node;
							}
							free( wpath );
						}
						else LogW(L"L%u:mallocエラー",__LINE__);
					}
				}
				while( FindNextFileW( handle, &wfd ) );
			}
			FindClose( handle );
		}
		else LogW(L"FindFirstFileW(%s)エラー%u",wfindir,GetLastError());
		free( wfindir );
	}
	else LogW(L"L%u:mallocエラー",__LINE__);
	return folder;
}
// お気に入り並び順をレジストリから取得
// http://www.arstdesign.com/articles/iefavorites.html
// http://mikeo410.lv9.org/lumadcms/~IE_FAVORITES_XBEL
// http://www.atmark.gr.jp/~s2000/r/memo.txt
// http://www.codeproject.com/Articles/22267/Internet-Explorer-Favorites-deconstructed
// http://deployment.xtremeconsulting.com/2010/09/24/windows-7-ie8-favorites-bar-organization-a-descent-into-binary-registry-storage/
typedef struct {
	DWORD		bytes;
	DWORD		sortIndex;
	WORD		key1;
	WORD		key2;		// bit0不明, bit1=1(URL)0(フォルダ), bit2=1(UNICODE)0(非UNICODE)
	DWORD		unknown0;
	DWORD		unknown1;
	WORD		key3;		// 0x0010はURL, 0x0020はフォルダ。key2と同じなので使わない。
	BYTE		name[1];	// 可変長ファイル(フォルダ)名。非UNICODEの場合は8.3形式NULL終端文字列。UNICODEでフォルダの場合5文字までならそのまま、6文字以上は謎のゴミつき文字列。UNICODEでURLの場合は9文字までならそのまま、10文字以上は謎のゴミつき文字列。ゴミがついている場合でもいちおうNULL終端しているもよう。
} RegFavoriteOrderItem;

typedef struct {
	DWORD					unknown0;
	DWORD					unknown1;
	DWORD					bytes;		// 全体バイト数
	DWORD					unknown2;
	DWORD					itemCount;	// アイテム(レコード)数
	RegFavoriteOrderItem	item[1];	// 先頭アイテム
} RegFavoriteOrder;

void FavoriteOrder( NodeList* folder, const WCHAR* subkey, DWORD ignoreBytes )
{
	if( folder ){
		HKEY key;
		if( RegOpenKeyExW( HKEY_CURRENT_USER, subkey, 0, KEY_READ, &key )==ERROR_SUCCESS ){
			WCHAR* name = L"Order";
			DWORD type, bytes;
			// データサイズ取得(終端NULL含む)
			if( RegQueryValueExW( key, name, NULL, &type, NULL, &bytes )==ERROR_SUCCESS ){
				RegFavoriteOrder* order = (RegFavoriteOrder*)malloc( bytes );
				if( order ){
					BYTE* limit = (BYTE*)order + bytes;
					// データ取得
					if( RegQueryValueExW( key, name, NULL, &type, (BYTE*)order, &bytes )==ERROR_SUCCESS ){
						RegFavoriteOrderItem* item = order->item;
						//DWORD count=0;
						//LogW(L"FavoriteOrder[%s]: %ubytes itemCount=%u %ubytes",wcsrchr(subkey,L'\\'),bytes,order->itemCount,order->bytes);
						while( (BYTE*)item < limit ){
							BOOL isURL = (item->key2 & 0x0002) ? TRUE : FALSE; // url or folder
							BOOL isUnicode = (item->key2 & 0x0004) ? TRUE : FALSE; // unicode encoding or codepage encoding
							//WCHAR* shortname;
							BYTE* longname;
							size_t len;
							NodeList* node;
							// nameの次にさらに可変長のUNICODE長いファイル(フォルダ)名が格納されている。
							// 可変長が2つ続いており構造体にできないためここで取り出す。
							if( isUnicode ){
								// nameがUNICODEの場合、URLなら9文字まで、フォルダなら5文字までは、謎の20～42
								// バイトをはさんで長いファイル名が始まる。nameがそれより長い場合はすぐ次に
								// 続けて長いファイル名が始まる。
								len = wcslen((WCHAR*)item->name);
								//shortname = wcsdup( (WCHAR*)item->name );
								longname = item->name + (len+1) * sizeof(WCHAR);
								// pass dummy bytes
								if( isURL ){
									if( len <= 9 ) longname += ignoreBytes;
								}
								else{
									if( len <= 5 ) longname += ignoreBytes;
								}
							}
							else{
								// nameが非UNICODEの場合、NULL文字含めたnameの長さを偶数にするためのパディング
								// バイトと、さらに謎の20～42バイトをはさんで長いファイル名(NULL終端)が続く。
								len = strlen((u_char*)item->name) + sizeof(u_char);
								//shortname = UTF8toWideCharAlloc( item->name );
								// make sure to take into account that we are at an uneven position
								longname = item->name + len + ((len%2)?1:0);
								// pass dummy bytes
								longname += ignoreBytes;
							}
							//LogW(L"FavoriteOrderItem%u: %ubytes sortIndex=%u Url=%u Unicode=%u shortname(%u)=%s longname=%s"
							//		,count++,item->bytes,item->sortIndex,isURL,isUnicode,len,shortname,(WCHAR*)longname);
							//free( shortname );
							// ノードリストの該当ノードにソートインデックスをセット
							for( node=folder->child; node; node=node->next ){
								if( wcsicmp(node->name,(WCHAR*)longname)==0 ){
									node->sortIndex = item->sortIndex;
									break;
								}
							}
							// フォルダ
							if( !isURL ){
								size_t len = wcslen(subkey) + 1 + wcslen((WCHAR*)longname) + 1;
								WCHAR* subkey2 = (WCHAR*)malloc( len * sizeof(WCHAR) );
								if( subkey2 ){
									_snwprintf(subkey2,len,L"%s\\%s",subkey,(WCHAR*)longname);
									FavoriteOrder( node, subkey2, ignoreBytes );
									free( subkey2 );
								}
							}
							// 次のアイテム
							item = (RegFavoriteOrderItem*)( (BYTE*)item + item->bytes );
						}
					}
					else LogW(L"RegQueryValueExW(%s\\%s)エラー%u",subkey,name,GetLastError());
					free( order );
				}
				else LogW(L"L%u:malloc(%u)エラー",__LINE__,bytes);
			}
			//else LogW(L"RegQueryValueExW(%s)エラー%u",subkey,GetLastError());
			RegCloseKey( key );
		}
		//else LogW(L"RegOpenKeyExW(%s)エラー",subkey);
	}
}
// ノードリスト並べ替え
// アルゴリズム的には単純バブルソートか…？ノード移動は単方向リストのつなぎかえ。
NodeList* NodeListSort( NodeList* top, int (*isReversed)( NodeList*, NodeList* ) )
{
	NodeList* this = top;
	NodeList* prev = NULL;
	while( this ){
		NodeList* next = this->next;
		// 子ノード並べ替え
		if( this->child ) this->child = NodeListSort( this->child, isReversed );
		// このノード並べ替え
		if( prev && isReversed(prev,this) ){
			// thisを前方に移動する
			if( isReversed(top,this) ){
				// 先頭に
				prev->next = next;
				this->next = top;
				top = this;
			}
			else{
				// 途中に
				NodeList* target = top;
				while( target->next ){
					if( isReversed(target->next,this) ) break;
					target = target->next;
				}
				prev->next = next;
				this->next = target->next;
				target->next = this;
			}
			// 前ノードポインタ変更なし
		}
		else{
			// 移動なし前ノードポインタ更新
			prev = this;
		}
		this = next;
	}
	return top;
}
// ソート用比較関数。p1が前、p2が次のノード。
// 1を返却した場合、p2がp1より前にあるべきとしてp2が前方に移動する。
int NodeIndexCompare( NodeList* p1, NodeList* p2 )
{
	// ソートインデックスが小さいものを前に
	if( p1->sortIndex > p2->sortIndex ) return 1;
	return 0;
}
int NodeNameCompare( NodeList* p1, NodeList* p2 )
{
	// ソートインデックスが同じ場合の名前の並び順。IE8と同じ並びになるように比較関数を選ぶ。
	// wcsicmpダメ、CompareStringWダメ、lstrcmpiWで同じになった。
	//if( p1->sortIndex==p2->sortIndex && wcsicmp(p1->name,p2->name)>0 ) return 1;
	/*
	if( p1->sortIndex==p2->sortIndex &&
		CompareStringW(
			LOCALE_USER_DEFAULT
			,NORM_IGNORECASE |NORM_IGNOREKANATYPE |NORM_IGNORENONSPACE |NORM_IGNORESYMBOLS |NORM_IGNOREWIDTH
			,p1->name, -1
			,p2->name, -1
		)<0
	) return 1;
	*/
	if( p1->sortIndex==p2->sortIndex && lstrcmpiW(p1->name,p2->name)>0 ) return 1;
	return 0;
}
int NodeTypeCompare( NodeList* p1, NodeList* p2 )
{
	// ソートインデックスが同じ場合フォルダを前に
	if( p1->sortIndex==p2->sortIndex && !p1->isFolder && p2->isFolder ) return 1;
	return 0;
}

NodeList* FavoriteListCreate( void )
{
	NodeList* list = NULL;
	WCHAR* favdir = FavoritesPathAlloc();
	if( favdir ){
		// Favoritesフォルダからノードリスト生成
		list = FolderFavoriteListCreate( favdir );
		free( favdir );
	}
	if( list ){
		DWORD ignoreBytes=0;	// Windows種類により異なるレジストリOrderバイナリレコード謎の無視バイト数
		OSVERSIONINFOA os;
		// [WindowsのOS判定]
		// http://cherrynoyakata.web.fc2.com/sprogram_1_3.htm
		// http://www.westbrook.jp/Tips/Win/OSVersion.html
		memset( &os, 0, sizeof(os) );
		os.dwOSVersionInfoSize = sizeof(os);
		GetVersionExA( &os );
		LogW(L"Windows%u.%u",os.dwMajorVersion,os.dwMinorVersion);
		switch( os.dwMajorVersion ){
		case 5: ignoreBytes = 20; break;	// XP,2003
		case 6: // Vista以降
			switch( os.dwMinorVersion ){
			case 0: ignoreBytes = 38; break;	// Vista,2008
			case 1: ignoreBytes = 42; break;	// 7,2008R2
			case 2: ignoreBytes = 42; break;	// 8,2012
			}
			break;
		}
		// レジストリのソートインデックス取得
		FavoriteOrder(
				list
				,L"Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\MenuOrder\\Favorites"
				,ignoreBytes
		);
		// ソートインデックスで並べ替え
		list = NodeListSort( list, NodeIndexCompare );
		// ソートインデックスが同じ中で名前で並べ替え
		list = NodeListSort( list, NodeNameCompare );
		// ソートインデックスが同じ中でフォルダを前に集める
		list = NodeListSort( list, NodeTypeCompare );
	}
	return list;
}
// ノードリストをJSONでファイル出力
void NodeListJSON( NodeList* node, FILE* fp, UINT* nextid, UINT depth, u_char* view )
{
	UINT count=0;
	if( depth==0 ){
		// ルートノード
		fprintf(fp,
			"{\"id\":%u"
			",\"dateAdded\":%I64u"
			",\"title\":\"root\""
			",\"child\":["
			,(*nextid)++
			,JSTime()
		);
		if( view ) fputs("\r\n",fp);
	}
	while( node ){
		u_char* title = WideCharToUTF8alloc( node->name );
		u_char* dot = strrchr(title,'.');
		if( dot ) *dot = '\0';
		//LogW(L"%u:%s%s",node->sortIndex,node->isFolder?L"フォルダ：":L"",node->name);
		if( node->isFolder ){
			// フォルダ
			if( view ){ UINT n; for( n=depth+1; n; n-- ) fputc('\t',fp); }
			if( count ) fputc(',',fp);
			fprintf(fp,
				"{\"id\":%u"
				",\"dateAdded\":%I64u"
				",\"title\":\"%s\""
				",\"child\":["
				,(*nextid)++
				,node->dateAdded
				,depth?(title?title:""):"お気に入り"	// トップフォルダは「お気に入り」固定
			);
			if( view ) fputs("\r\n",fp);
			// 再帰
			NodeListJSON( node->child, fp, nextid, depth+1, view );
			if( view ){ UINT n; for( n=depth+1; n; n-- ) fputc('\t',fp); }
			fputs("]}",fp);
			count++;
			if( view ) fputs("\r\n",fp);
		}
		else{
			// URL
			if( view ){ UINT n; for( n=depth+1; n; n-- ) fputc('\t',fp); }
			if( count ) fputc(',',fp);
			fprintf( fp,
				"{\"id\":%u"
				",\"dateAdded\":%I64u"
				",\"title\":\"%s\""
				",\"url\":\"%s\""
				",\"icon\":\"%s\"}"
				,(*nextid)++
				,node->dateAdded
				,title?title:""
				,node->url?node->url:""
				,node->icon?node->icon:""
			);
			count++;
			if( view ) fputs("\r\n",fp);
		}
		if( title ) free( title );
		node = node->next;
	}
	if( depth==0 ){
		// ごみ箱
		if( view ) fputc('\t',fp);
		fprintf(fp,
			",{\"id\":%u"
			",\"dateAdded\":%I64u"
			",\"title\":\"ごみ箱\""
			",\"child\":[]}%s]"
			",\"nextid\":%u}"
			,*nextid
			,JSTime()
			,view?"\r\n":""
			,*nextid +1
		);
		(*nextid) += 2;
	}
}



//---------------------------------------------------------------------------------------------------------------
// ANSIとUnicodeとどううまく共通化すれば…
u_char* FileContentTypeA( u_char* file )
{
	if( file ){
		u_char* ext = strrchr(file,'.');
		if( ext ){
			ext++;
			if( stricmp(ext,"txt")==0 )  return "text/plain";
			if( stricmp(ext,"htm")==0 )  return "text/html";
			if( stricmp(ext,"html")==0 ) return "text/html";
			if( stricmp(ext,"js")==0 )   return "text/javascript";
			if( stricmp(ext,"css")==0 )  return "text/css";
			if( stricmp(ext,"jpg")==0 )  return "image/jpeg";
			if( stricmp(ext,"jpeg")==0 ) return "image/jpeg";
			if( stricmp(ext,"png")==0 )  return "image/png";
			if( stricmp(ext,"gif")==0 )  return "image/gif";
			if( stricmp(ext,"ico")==0 )  return "image/vnd.microsoft.icon";
			if( stricmp(ext,"zip")==0 )  return "application/zip";
			if( stricmp(ext,"pdf")==0 )  return "application/pdf";
			if( stricmp(ext,"exe")==0 )  return "application/x-msdownload";
			if( stricmp(ext,"dll")==0 )  return "application/x-msdownload";
			if( stricmp(ext,"json")==0 ) return "application/json";
			if( stricmp(ext,"jsonp")==0 )return "application/javascript";
			if( stricmp(ext,"mp4")==0 )  return "video/mp4";
			if( stricmp(ext,"flv")==0 )  return "video/flv";
		}
	}
	return "application/octet-stream";
}
u_char* FileContentTypeW( WCHAR* file )
{
	if( file ){
		WCHAR* ext = wcsrchr(file,L'.');
		if( ext ){
			ext++;
			if( wcsicmp(ext,L"txt")==0 )  return "text/plain";
			if( wcsicmp(ext,L"htm")==0 )  return "text/html";
			if( wcsicmp(ext,L"html")==0 ) return "text/html";
			if( wcsicmp(ext,L"js")==0 )   return "text/javascript";
			if( wcsicmp(ext,L"css")==0 )  return "text/css";
			if( wcsicmp(ext,L"jpg")==0 )  return "image/jpeg";
			if( wcsicmp(ext,L"jpeg")==0 ) return "image/jpeg";
			if( wcsicmp(ext,L"png")==0 )  return "image/png";
			if( wcsicmp(ext,L"gif")==0 )  return "image/gif";
			if( wcsicmp(ext,L"ico")==0 )  return "image/vnd.microsoft.icon";
			if( wcsicmp(ext,L"zip")==0 )  return "application/zip";
			if( wcsicmp(ext,L"pdf")==0 )  return "application/pdf";
			if( wcsicmp(ext,L"exe")==0 )  return "application/x-msdownload";
			if( wcsicmp(ext,L"dll")==0 )  return "application/x-msdownload";
			if( wcsicmp(ext,L"json")==0 ) return "application/json";
			if( wcsicmp(ext,L"jsonp")==0 )return "application/javascript";
			if( wcsicmp(ext,L"mp4")==0 )  return "video/mp4";
			if( wcsicmp(ext,L"flv")==0 )  return "video/flv";
		}
	}
	return "application/octet-stream";
}

// 文字数指定strdup
// srcがnより短い場合は実行してはいけない
u_char* strndup( const u_char* src, int n )
{
	if( src && n>0 ){
		u_char* dup = (u_char*)malloc( n + 1 );
		if( dup ){
			memcpy( dup, src, n );
			dup[n] = '\0';
		}
		else LogW(L"L%u:mallocエラー",__LINE__);

		return dup;
	}
	return NULL;
}

// " と \ をエスケープしてstrndup
// srcがnより短い場合は実行してはいけない。
// UTF-8なら2バイト目以降にASCII文字は出てこない(らしい)ので多バイト文字識別不要。
u_char* strndupJSON( const u_char* src, int n )
{
	if( src && n>0 ){
		u_char* dup = (u_char*)malloc( n * 2 + 1 );
		if( dup ){
			u_char* dst = dup;
			int i;
			for( i=n; i>0; i-- ){
				if( *src=='"' || *src=='\\' ) *dst++ = '\\';
				*dst++ = *src++;
			}
			*dst = '\0';
		}
		else LogW(L"L%u:mallocエラー",__LINE__);
		return dup;
	}
	return NULL;
}

// 大小文字区別しないstrstr()
u_char* stristr( const u_char* buf, const u_char* word )
{
	if( buf && word ){
		size_t len = strlen( word );
		while( *buf ){
			if( strnicmp( buf, word, len )==0 ) return buf;
			buf++;
		}
	}
	//else LogW(L"stristr引数不正");
	return NULL;
}

// 文字列sにあるN個目の文字cの位置を返す
// Nが負の場合は末尾から数えてN個目
WCHAR* wcschrN( const WCHAR* s, WCHAR c, int N )
{
	if( s && *s ){
		int n=0;
		if( N >0 ){
			// 先頭から
			for( ; *s; s++ ) if( *s==c && ++n==N ) return s;
		}
		else if( N <0 ){
			// 末尾から
			WCHAR* p = s +wcslen(s) -1;
			for( N=-N; s<=p && *p; p-- ) if( *p==c && ++n==N ) return p;
		}
	}
	return NULL;
}

BOOL readable( SOCKET sock, DWORD msec )
{
	fd_set fdset;
	struct timeval wait;

	FD_ZERO( &fdset );
	FD_SET( sock, &fdset );

	wait.tv_sec = msec / 1000;
	wait.tv_usec = ( msec - ( wait.tv_sec * 1000 ) ) * 1000;

	return select( 0, &fdset, NULL, NULL, &wait );
}

u_char* strHeaderValue( const u_char* buf, const u_char* name )
{
	if( buf && name ){
		u_char* value = stristr( buf, name );
		if( value ){
			if( buf==value || (buf < value && *(value-1)=='\n') ){
				value += strlen( name );
				while( *value==' ' || *value=='\t' ) value++;
				if( *value==':' ){
					value++;
					while( *value==' ' || *value=='\t' ) value++;
					return value;
				}
			}
		}
	}
	return NULL;
}

BOOL UnderDocumentRoot( const WCHAR* path )
{
	if( path && wcsnicmp(path,DocumentRoot,DocumentRootLen)==0 ){
		if( path[DocumentRootLen]==L'\\' ) return TRUE;
		if( path[DocumentRootLen]==L'\0' ) return TRUE;
	}
	return FALSE;
}

u_char* strWeekday( WORD wDayOfWeek )
{
	switch( wDayOfWeek ){
	case 0: return "Sun";
	case 1: return "Mon";
	case 2: return "Tue";
	case 3: return "Wed";
	case 4: return "Thu";
	case 5: return "Fri";
	case 6: return "Sat";
	}
	return "Unknown";
}

u_char* strMonth( WORD wMonth )
{
	switch( wMonth ){
	case 1: return "Jan";
	case 2: return "Feb";
	case 3: return "Mar";
	case 4: return "Apr";
	case 5: return "May";
	case 6: return "Jun";
	case 7: return "Jul";
	case 8: return "Aug";
	case 9: return "Sep";
	case 10: return "Oct";
	case 11: return "Nov";
	case 12: return "Dec";
	}
	return "Unknown";
}

// HTTP日付文字列をUINT64に変換
UINT64 UINT64InetTime( u_char* intime )
{
	SYSTEMTIME st;
	FILETIME ft;
	InternetTimeToSystemTimeA( intime, &st, 0 );
	SystemTimeToFileTime( &st, &ft );
	return *(UINT64*)&ft;
}

// タイムアウト指定connectラッパ
// http://azskyetc.client.jp/program/timeout.html
// http://tip.sakura.ne.jp/htm/netframe.htm
int connect2( SOCKET sock, const SOCKADDR* name, int namelen, DWORD timeout_msec )
{
	int result=SOCKET_ERROR;
	// イベント作成
	WSAEVENT hEvent = WSACreateEvent();
	if( hEvent !=WSA_INVALID_EVENT ){
		// イベント型に(自動的にノンブロッキングに)
		if( WSAEventSelect( sock, hEvent, FD_CONNECT ) !=SOCKET_ERROR ){
			u_long off = 0;
			// 接続
			int err = connect( sock, name, namelen );
			if( err !=SOCKET_ERROR || WSAGetLastError()==WSAEWOULDBLOCK ){
				DWORD dwRes = WSAWaitForMultipleEvents( 1, &hEvent, FALSE, timeout_msec, FALSE );
				switch( dwRes ){
				case WSA_WAIT_EVENT_0:
					{
						WSANETWORKEVENTS events;
						if( WSAEnumNetworkEvents( sock, hEvent, &events ) !=SOCKET_ERROR ){
							if((events.lNetworkEvents & FD_CONNECT) && events.iErrorCode[FD_CONNECT_BIT]==0 ){
								// 成功
								result=0;
							}
							else LogW(L"[%u]WSAEnumNetworkEventsエラー？",sock);
						}
						else LogW(L"[%u]WSAEnumNetworkEventsエラー(%u)",sock,WSAGetLastError());
					}
					break;
				case WSA_WAIT_TIMEOUT:
					LogW(L"[%u]connectタイムアウト",sock);
					break;
				case WSA_WAIT_FAILED:
				default:
					LogW(L"[%u]WSAWaitForMultipleEventsエラー(%u)",sock,dwRes);
				}
			}
			// イベント型終了
			WSAEventSelect( sock, NULL, 0 );
			WSACloseEvent( hEvent );
			// ブロッキングに戻す
			ioctlsocket( sock, FIONBIO, &off );
		}
		else LogW(L"[%u]WSAEventSelectエラー(%u)",sock,WSAGetLastError());
	}
	else LogW(L"[%u]WSACreateEventエラー(%u)",sock,WSAGetLastError());

	return result;
}

// HTTPクライアント
typedef struct {
	size_t		bufsize;		// 受信バッファサイズ
	size_t		bytes;			// 受信バッファ有効バイト
	UINT		ContentLength;	// Content-Length値
	u_char		ContentType;	// Content-Type識別
	#define		TEXT_HTML		0x01
	u_char		charset;		// 文字コード識別
	#define		UTF8			0x01
	#define		SJIS			0x02
	#define		EUC				0x03
	#define		JIS				0x04
	u_char*		body;			// レスポンス本文開始
	u_char		buf[1];			// 受信バッファ(可変長文字列)
} HTTPGet;

HTTPGet* httpGET( const u_char* url, const u_char* ua )
{
	BOOL		ssl_enable		= FALSE;
	SSL*		ssl_sock		= NULL;
	BOOL		success			= FALSE;
	#define		HTTPGET_BUFSIZE	(1024*16) // 初期バッファサイズあまり拡大が発生しない程度の大きさに
	HTTPGet*	rsp;

	if( !url || !*url ){
		LogW(L"URLが空です"); return NULL;
	}
	rsp = (HTTPGet*)malloc( sizeof(HTTPGet) + HTTPGET_BUFSIZE );
	if( !rsp ){
		LogW(L"L%u:mallocエラー",__LINE__); return NULL;
	}
	memset( rsp, 0, sizeof(HTTPGet) );
	rsp->bufsize = HTTPGET_BUFSIZE;
	if( strnicmp(url,"http://",7)==0 ){
		url += 7;
	}
	else if( strnicmp(url,"https://",8)==0 ){
		url += 8;
		if( ssl_ctx )
			ssl_enable = TRUE;
		else
			goto fin;
	}
	else{
		LogA("不明なプロトコル:%s",url);
		goto fin;
	}
	if( *url ){
		u_char* path = strchr(url,'/');
		u_char* host;
		if( path ){
			host = strndup( url, path - url );
			path++;
		}
		else{
			host = strdup( url );
			path = "";
		}
		if( host ){
			u_char* port = strrchr(host,':');
			if( port ) *port++ = '\0'; else port = (ssl_enable)?"443":"80";
			{
				ADDRINFOA hint;
				ADDRINFOA* adr=NULL;
				memset( &hint, 0, sizeof(hint) );
				hint.ai_socktype = SOCK_STREAM;
				hint.ai_protocol = IPPROTO_TCP;
				// 名前解決も時間がかかる場合があるが、タイムアウト処理は難しいもよう・・
				if( getaddrinfo( host, port, &hint, &adr )==0 ){
					SOCKET sock = socket( adr->ai_family, adr->ai_socktype, adr->ai_protocol );
					// タイムアウト5秒
					if( connect2( sock, adr->ai_addr, (int)adr->ai_addrlen, 5000 ) !=SOCKET_ERROR ){
						DWORD timelimit;
						struct timeval timeout = { 5, 0 };
						int len;
						// send/recvタイムアウトセット
						// SO_SNDTIMEOはconnectにも効く、いや効かないといういろんな情報があって謎。
						// 受信はreadable()も使っているので変な感じかもしれないけどまあいいか…。
						setsockopt( sock, SOL_SOCKET, SO_SNDTIMEO, (char*)&timeout, sizeof(timeout) );
						setsockopt( sock, SOL_SOCKET, SO_RCVTIMEO, (char*)&timeout, sizeof(timeout) );
						if( ssl_enable ){
							BOOL success = FALSE;
							// SSL構造体生成
							ssl_sock = SSL_new( ssl_ctx );
							if( ssl_sock ){
								// ソケットをSSLに紐付け
								SSL_set_fd( ssl_sock, sock );
								// PRNG 初期化(/dev/random,/dev/urandomがない環境で必要らしい)
								RAND_poll();
								while( RAND_status()==0 ){
									unsigned short rand_ret = rand() % 65536;
									RAND_seed(&rand_ret, sizeof(rand_ret));
								}
								// SSLハンドシェイク
								if( SSL_connect( ssl_sock )==1 ){
									LogA("[%u]外部接続(SSL):%s:%s",sock,host,port);
									success = TRUE;
								}
								else LogA("[%u]SSL_connect(%s:%s)エラー",sock,host,port);
							}
							else LogW(L"[%u]SSL_newエラー",sock);

							if( !success ) goto shutdown;
						}
						else LogA("[%u]外部接続:%s:%s",sock,host,port);
						// リクエスト送信
						len =_snprintf(rsp->buf,rsp->bufsize,
							"GET /%s HTTP/1.0\r\n"
							"Host: %s\r\n"			// fc2でHostヘッダがないとエラーになる
							"User-Agent: %s\r\n"	// facebookでUser-Agentないと302 move
							"Accept-Encoding: \r\n"	// つけないとContent-Encoding:gzipで返してくるサーバがある
							"Connection: close\r\n"
							"\r\n"
							,path, host, (ua && *ua)? ua : "Mozilla/4.0"
						);
						if( len<0 ) len = rsp->bufsize;
						if( ssl_enable ){
							if( SSL_write( ssl_sock, rsp->buf, len )<1 ){
								LogW(L"[%u]SSL_writeエラー",sock);
							}
						}
						else{
							if( send( sock, rsp->buf, len, 0 )==SOCKET_ERROR ){
								LogW(L"[%u]sendエラー(%u)",sock,WSAGetLastError());
							}
						}
						rsp->buf[rsp->bufsize-1]='\0';
						LogA("[%u]外部送信:%s",sock,rsp->buf);
						// レスポンス受信4秒待つ
						*rsp->buf = '\0';
						timelimit = timeGetTime() +4000;
						while( readable(sock, timelimit - timeGetTime()) ){
							int bytes;
							if( ssl_enable )
								bytes = SSL_read( ssl_sock, rsp->buf +rsp->bytes, rsp->bufsize -rsp->bytes );
							else
								bytes = recv( sock, rsp->buf +rsp->bytes, rsp->bufsize -rsp->bytes, 0 );
							if( bytes >0 ){
								rsp->bytes += bytes;
								rsp->buf[rsp->bytes] = '\0';
								// 本文
								if( !rsp->body ){
									rsp->body = strstr(rsp->buf,"\r\n\r\n");
									if( rsp->body ){
										*rsp->body = '\0';
										rsp->body += 4;
									}else{
										rsp->body = strstr(rsp->buf,"\n\n");
										if( rsp->body ){
											*rsp->body = '\0';
											rsp->body += 2;
										}
									}
								}
								// ヘッダ
								if( rsp->body ){
									if( !rsp->ContentType ){
										u_char* p = strHeaderValue(rsp->buf,"Content-Type");
										if( p ){
											if( strnicmp(p,"text/html",9)==0 ){
												rsp->ContentType = TEXT_HTML; //LogW(L"HTMLです");
											}
											p = stristr(p,"charset=");
											if( p ){
												p += 8;
												if( *p=='"') p++;
												if( strnicmp(p,"utf-8",5)==0 )
													rsp->charset = UTF8;
												else if( strnicmp(p,"shift_jis",9)==0 )
													rsp->charset = SJIS;
												else if( strnicmp(p,"euc-jp",6)==0 )
													rsp->charset = EUC;
												else if( strnicmp(p,"iso-2022-jp",11)==0 )
													rsp->charset = JIS;
												//LogW(L"charset=%u",rsp->charset);
											}
										}
									}
									if( !rsp->ContentLength ){
										u_char* p = strHeaderValue(rsp->buf,"Content-Length");
										if( p ){
											UINT n = 0;
											while( isdigit(*p) ){
												n = n*10 + *p - '0';
												p++;
											}
											rsp->ContentLength = n; //LogW(L"%uバイトです",n);
										}
									}
								}
								if( rsp->ContentType==TEXT_HTML ){
									// HTMLなら</head>まで
									if( stristr(rsp->body,"</head>") ) break;
								}
								if( rsp->ContentLength ){
									// Content-Lengthぶん受信したらおわり
									if( rsp->bytes - (rsp->body - rsp->buf) >= rsp->ContentLength ) break;
								}
								// バッファいっぱい
								if( rsp->bytes >= rsp->bufsize ){
									size_t newsize = rsp->bufsize * 2;
									HTTPGet* newrsp = (HTTPGet*)malloc( sizeof(HTTPGet) + newsize );
									if( newrsp ){
										int distance = (BYTE*)newrsp - (BYTE*)rsp;
										memcpy( newrsp, rsp, sizeof(HTTPGet) + rsp->bytes );
										free( rsp );
										rsp = newrsp;
										rsp->bufsize = newsize;
										if( rsp->body ) rsp->body += distance;
										LogW(L"HTTPクライアントバッファ拡大%ubytes",newsize);
									}
									else{
										LogW(L"L%u:mallocエラー",__LINE__);
										break;
									}
								}
							}
							else{
								LogW(L"[%u]%s()=%d",sock,(ssl_enable)?L"SSL_read":L"recv",bytes);
								break;
							}
						}
						LogA("[%u]外部受信%dbytes:%s",sock,rsp->bytes,rsp->buf);
					  shutdown:
						if( ssl_enable ){
							SSL_shutdown( ssl_sock );
							SSL_free( ssl_sock ); 
						}
						shutdown( sock, SD_BOTH );
						success = TRUE;
					}
					else LogA("[%u]connect(%s:%s)エラー(%u)",sock,host,port,WSAGetLastError());

					closesocket( sock );
					freeaddrinfo( adr );
				}
				else LogA("ホスト%sが見つかりません",host);
			}
			free( host );
		}
		else LogW(L"L%u:mallocエラー",__LINE__);
	}
	else LogA("不正なURL:%s",url);
fin:
	if( !success ) free(rsp), rsp=NULL;
	return rsp;
}

// mlang.dll文字コード変換
#include <mlang.h>
typedef HRESULT (APIENTRY *CONVERTINETSTRING)( LPDWORD,DWORD,DWORD,LPCSTR,LPINT,LPBYTE,LPINT );
struct {
	HMODULE				dll;
	CONVERTINETSTRING	Convert;
} mlang = { NULL, NULL };

// 指定サイトのタイトルとか解析するスレッド関数
// クライアントからの要求 GET /:analyze?URL HTTP/1.x で開始され、
// URLのタイトルとfaviconを解析し、JSON形式の応答文字列を生成する。
//		{"title":"タイトル","icon":"URL"}
// URLのエンコードは施されている前提。単純ブロッキングソケット利用。
// TODO:URLがamazonアダルトコンテンツだと「警告：」というページタイトルになる。
// 「18歳以上」をクリックするとクッキーが発行されて、そのクッキーを送信すれば
// 目的のタイトルを取得できる仕組み？JavaScriptでは他ドメインのクッキーは取得
// できないっぽいので、やるとしたらサーバ側で自動で「18歳以上」をクリックする
// 動作をやってしまうことか…。ブラウザが保持してるamazonクッキーを取得する手
// はあるのかな？でもそんなことするアプリはセキュリティ的にまずそうで厳しいか。
// しかしブラウザで表示してたタイトルを取得できないのはブックマークとしては
// イマイチなのも確か…。なにかいい手はないものか…。
// ブラウザのアドオンを使う手もあるか？
unsigned __stdcall analyze( void* p )
{
	TClient* cp = (TClient*)p;
	u_char* url = cp->req.param;
	HTTPGet* rsp;
	// メインスレッドなにもしない
	cp->status = CLIENT_THREADING;
	// URL取得。req.paramは今のところURLのみ。
	rsp = httpGET( url, cp->req.UserAgent );
	if( rsp ){
		u_char* title=NULL, *icon=NULL;
		if( cp->abort ) goto fin;
		// 本文をUTF-8に変換。文字コードは細かい話は相変わらずカオスのようだ。
		// EUCはMultiByteToWideChar()では20932、ConvertINetString()では51932らしい。
		// とりあえずConvertINetString()で変換しておく。
		if( rsp->ContentType==TEXT_HTML ){
			if( mlang.Convert ){
				DWORD CP = 20127;	// 文字コード不明の場合はUS-ASCIIとみなす
				switch( rsp->charset ){
				case UTF8: CP = 65001; break;
				case SJIS: CP = 932;   break;
				case EUC : CP = 51932; break;
				case JIS : CP = 50221; break;
				default:
					if( rsp->body ){
						// HTTPヘッダにcharset指定がなかった場合。
						// HTMLヘッダ<meta>に従うべきだが、その文字列が既にエンコードされているので…。
						// <meta>は無視して DetectInputCodepage() で判定する。MLDETECTCP_HTML を使えば
						// それなりにちゃんと判定できているようにみえる(既定の MLDETECTCP_NONE は挙動
						// 不審で使いものにならない)。「バベル」というC++ライブラリが評価高いようだが
						// C++インタフェースのみ。
						// http://yuzublo.blog48.fc2.com/blog-entry-29.html
						IMultiLanguage2 *mlang2;
						HRESULT res;
						CoInitialize(NULL);
						// http://katsura-kotonoha.sakura.ne.jp/prog/vc/tip00004.shtml
						// http://katsura-kotonoha.sakura.ne.jp/prog/vc/tip00005.shtml
						res = CoCreateInstance(
									&CLSID_CMultiLanguage
									,NULL
									,CLSCTX_INPROC_SERVER
									,&IID_IMultiLanguage2
									,(void**)&mlang2
						);
						if( SUCCEEDED(res) ){
							int dataLen = rsp->bytes - (rsp->body - rsp->buf);	// 判定データバイト
							int count = 1;										// 判定結果の候補数
							DetectEncodingInfo info;							// 判定結果
							res = mlang2->lpVtbl->DetectInputCodepage( mlang2
										,MLDETECTCP_HTML
										,0
										,rsp->body
										,&dataLen
										,&info
										,&count
							);
							if( SUCCEEDED(res) ){
								CP = info.nCodePage;
							}
							mlang2->lpVtbl->Release( mlang2 );
						}
						CoUninitialize();
					}
				}
				if( CP !=65001 && CP !=20127 ){	// UTF-8,US-ASCIIは変換なし
					int tmpbytes = rsp->bufsize - (rsp->body - rsp->buf);
					BYTE* tmp = (BYTE*)malloc( tmpbytes-- );	// NULL終端文字ぶん減らしておく
					if( tmp ){
						DWORD mode=0;
						HRESULT res;
						// まずSJIS(932)に変換
						res = mlang.Convert( &mode, CP, 932, rsp->body, NULL, tmp, &tmpbytes );
						if( res==S_OK ){
							tmp[tmpbytes]='\0';
							tmpbytes = rsp->bufsize - (rsp->body - rsp->buf) -1;
							mode=0;
							// 次にSJISからUTF8に変換(なぜかEUCからUTF8直変換がエラーになってしまうので)
							res = mlang.Convert( &mode, 932, 65001, tmp, NULL, rsp->body, &tmpbytes );
							if( res==S_OK ){
								rsp->body[tmpbytes]='\0';
								LogW(L"[%u]文字コード%u->65001変換",Num(cp),CP);
							}
							else LogW(L"[%u]ConvertINetString(932->65001)エラー",Num(cp));
						}
						else LogW(L"[%u]ConvertINetString(%u->932)エラー",Num(cp),CP);

						free(tmp);
					}
					else LogW(L"L%u:malloc(%u)エラー",__LINE__,tmpbytes);
				}
			}
		}
		// タイトル取得
		// http://api.jquery.com/jQuery.ajax/やhttp://www.hide10.com/archives/6186は、
		// リクエストにAccept-Encodingがない場合、Content-Encoding:gzip で応答が返ってくる。
		// gzip未対応なのでとりあえず値が空のAccept-Encodingヘッダをリクエストにつけたら
		// どっちも大丈夫になった。gzipに対応するにはzlibを使えばいいのかな…後回し(；´Д｀)
		{
			u_char* begin = stristr(rsp->body,"<title");
			u_char* end;
			if( begin ){
				begin += 6;
				end = stristr(begin,"</title>");
				begin = strchr(begin,'>');
				if( begin && end ){
					begin++; end--;
					while( isspace(*begin) ) begin++;
					while( isspace(*end) ) end--;
					if( begin < end ){
						title = strndupJSON( begin, end - begin + 1 );
						CRLFtoSPACE( title );
					}
				}
				else LogW(L"[%u]</title>が見つかりません(%s)",Num(cp),url);
			}
			else LogA("[%u]<title>が見つかりません(%s)",Num(cp),url);
		}
		// favicon取得
		{
			// まず<link rel=icon href="xxx">をさがす
			u_char* begin = rsp->body;
			while( begin=stristr(begin,"<link") ){
				u_char* end;
				begin += 5;
				end = strchr(begin,'>');
				if( end ){
					u_char* rel = stristr(begin," rel=");
					if( rel ){
						rel += 5;
						if( rel < end ){
							if( strnicmp(rel,"\"shortcut icon\"",15)==0
								|| strnicmp(rel,"\"icon\"",6)==0
								|| strnicmp(rel,"icon ",5)==0 ){
								u_char* href = stristr(begin," href=");
								if( href ){
									href += 6;
									if( href < end ){
										if( *href=='"' ){
											u_char* endquote = strchr(++href,'"');
											if( endquote )
												icon = strndup( href, endquote - href );
										}
										else{
											u_char* space = strchr(href,' ');
											if( space )
												icon = strndup( href, space - href );
										}
										if( icon ) break;
									}
								}
							}
						}
					}
					begin = end + 1;
				}
			}
			// 相対URLは完全URLになおす
			if( icon && !strstr(icon,"://") ){
				u_char* url = NULL;
				u_char* host = strstr(cp->req.param,"://");
				if( host ){
					host += 3;
					if( *icon=='/' ){
						// href="/img/favicon.ico"
						u_char* slash = strchr(host,'/');
						if( slash ) *slash = '\0';
						url = (u_char*)malloc( strlen(cp->req.param) +strlen(icon) +1 );
						if( url ) sprintf(url,"%s%s",cp->req.param,icon);
						else LogW(L"L%u:mallocエラー",__LINE__);
						if( slash ) *slash = '/';
					}
					else{
						// href="img/favicon.ico"
						u_char* slash = strrchr(host,'/');
						if( slash ) *slash = '\0';
						url = (u_char*)malloc( strlen(cp->req.param) +strlen(icon) +2 );
						if( url ) sprintf(url,"%s/%s",cp->req.param,icon);
						else LogW(L"L%u:mallocエラー",__LINE__);
						if( slash ) *slash = '/';
					}
				}
				free( icon );
				icon = url;
			}
			// URL取得確認
			if( icon ){
				HTTPGet* tmp = httpGET( icon, cp->req.UserAgent );
				BOOL success=FALSE;
				if( tmp ){
					// HTTP/1.x 200 OK
					// あまり厳密チェックせず2xxか3xxならオッケーとする
					if( tmp->buf[9]=='2' || tmp->buf[9]=='3' ) success=TRUE;
					free( tmp );
				}
				if( !success ) free(icon), icon=NULL;
			}
			// <link>がなかったらhttp(s)://host/favicon.icoがあるか確認
			if( !icon ){
				u_char* host = strstr(cp->req.param,"://");
				u_char* slash;
				if( host ){
					host += 3;
					slash = strchr(host,'/');
					if( slash ) *slash = '\0';
					icon = (u_char*)malloc( strlen(cp->req.param) +strlen("/favicon.ico") +1 );
					if( icon ){
						HTTPGet* tmp;
						BOOL success=FALSE;
						sprintf(icon,"%s/favicon.ico",cp->req.param);
						tmp = httpGET( icon, cp->req.UserAgent );
						if( tmp ){
							if( strnicmp(tmp->buf+8," 200 ",5)==0 ) // HTTP/1.x 200 OK
								if( tmp->ContentType !=TEXT_HTML ) // text/html 除外
									success=TRUE;
							free( tmp );
						}
						if( !success ) free(icon), icon=NULL;
					}
					else LogW(L"L%u:mallocエラー",__LINE__);
					if( slash ) *slash = '/';
				}
			}
		}
		// JSON形式応答文字列
		// Content-Lengthなくても大丈夫なようだ…
		ClientSendf(cp,
				"HTTP/1.0 200 OK\r\n"
				"Content-Type: application/json; charset=utf-8\r\n"
				"Connection: close\r\n"
				"\r\n"
				"{\"title\":\"%s\",\"icon\":\"%s\"}"
				,title?title:""
				,icon?icon:""
		);
		// 解放
	fin:
		if( title ) free(title), title=NULL;
		if( icon ) free(icon), icon=NULL;
		free(rsp), rsp=NULL;
	}
	else ClientSendErr(cp,"500 Internal Server Error");

	if( cp->abort ){
		LogW(L"[%u]中断します...",Num(cp));
		cp->status = 0;
	}
	else{
		// メインスレッドで処理続行
		cp->status = CLIENT_SEND_READY;
		PostMessage( MainForm, WM_SOCKET, (WPARAM)cp->sock, (LPARAM)FD_WRITE );
	}
	_endthreadex(0);
	return 0;
}



//---------------------------------------------------------------------------------------------------------------
// Firefoxのplaces.sqliteパスを取得
// 1. Profiles.ini の Path= を取得
//    パス＝%APPDATA%\Mozilla\Firefox\Profiles.ini
//    ex) C:\Documents and Settings\user\Application Data\Mozilla\Firefox\Profiles.ini
//    の中の、セクション[Profile0]の Path= エントリの値を取得
//    ex) [Profile0]
//        Path=Profiles/mju3pugh.default
// 2. places.sqlite
//    パス＝%APPDATA%\Mozilla\Firefox\(1.のPath)\places.sqlite
//    ex) C:\Documents and Settings\user\Application Data\Mozilla\Firefox\Profiles\mju3pugh.default\places.sqlite
// 参考サイト
// http://support.mozilla.org/ja/kb/profiles-where-firefox-stores-user-data
// http://firefox.geckodev.org/index.php?%E3%83%97%E3%83%AD%E3%83%95%E3%82%A1%E3%82%A4%E3%83%AB
// TODO:Firefox起動引数で別のプロファイルフォルダを使うこともできるらしく、
// そっちの places.sqlite を参照したい場合はフォルダをユーザ指定する機能をつけないと…
//
WCHAR* FirefoxPlacesPathAlloc( void )
{
	#define PROFILES_INI L"%APPDATA%\\Mozilla\\Firefox\\profiles.ini"
	#define PLACES_SQLITE L"places.sqlite"
	WCHAR* places = NULL;
	// 環境変数展開
	DWORD length = ExpandEnvironmentStringsW( PROFILES_INI, NULL, 0 );
	WCHAR* profiles = (WCHAR*)malloc( length *sizeof(WCHAR) );
	if( profiles ){
		WCHAR path[MAX_PATH+1];
		ExpandEnvironmentStringsW( PROFILES_INI, profiles, length );
		GetPrivateProfileStringW(L"Profile0",L"Path",L"",path,sizeof(path)/sizeof(WCHAR),profiles);
		if( *path ){
			WCHAR* sep = wcsrchr( profiles, L'\\' );
			if( sep ){
				size_t len = (sep-profiles) +wcslen(path) +wcslen(PLACES_SQLITE) +3;
				// 末尾"\\profiles.ini"を削除
				*sep = L'\0';
				// profiles\path\places.sqlite
				places = (WCHAR*)malloc( len *sizeof(WCHAR) );
				if( places ) _snwprintf(places,len,L"%s\\%s\\%s",profiles,path,PLACES_SQLITE);
				else LogW(L"L%u:mallocエラー",__LINE__);
			}
			else LogW(L"不正パス？:%s",profiles);
		}
		else LogW(L"Firefoxプロファイルパスがわかりません");
		free( profiles );
	}
	else LogW(L"L%u:mallocエラー",__LINE__);

	return places;
}
// FirefoxブックマークJSONイメージ作成
// ブックマーク管理画面だとトップレベルに以下３つの固定フォルダ(?)
//  - ブックマークツールバー
//  - ブックマークメニュー
//  - 未整理のブックマーク
// SQLiteとかいうローカルDBを使っているようだ。履歴とブックマークが統合され、places.sqlite ファイルに
// 格納されている。自力でDB構造を辿らないといけない。めんどくせええええええええええええええええええ。
// Firefoxアドオン SQLite Manager で自分の places.sqlite の中身みれる。
// テーブル
//  - moz_bookmarks_roots	ルートフォルダ
//  - moz_bookmarks			ブックマークとフォルダ
//  - moz_places			URL
//  - moz_items_annos		説明
//  - moz_favicons			faviconデータ
// う～んブックマークフォルダ構造を上から順番にたどるには、どのようにSQL文で参照すればよいのやら…？
// とりあえず手打ちSQL文でどうするか決めないとプログラムにできん。ちなみにFirefox自身はどういうSQL
// を使ってるんだろうか。mozilla-1-9-2-a776a2590177 とかいうソースだと、toolkit/components/places/src
// フォルダに moz_bookmarks テーブルを走査するソースコードがあるようだが…膨大すぎて読みたくない…。
// 適当に自力で考える。
// 1. moz_bookmarks_roots テーブルはいらない参照しない
// 2. moz_bookmarks テーブルから parent=0 のエントリを抽出(見つからなければ parent=1,2,..と増やす？？)
// 3. position(0～)が並び順(ソートする)
// 4. type=2 がフォルダ、type=1 がブックマーク
// 5. id がエントリID
// 6. dateAdded が作成日(例:1345119058992000)
// 7. フォルダの場合は、parent=エントリIDを抽出(再帰で2.から)
// 8. ブックマークの場合はfk値がmoz_placesのエントリのidに対応、urlにリンクURLが入ってる
// 9. 説明は moz_items_annos テーブルの content に入っており、item_id が moz_bookmarksエントリの id に対応。
// 10.faviconはmoz_placesのfavicon_idの値がmoz_faviconsのidに対応しており、moz_faviconsにurlやデータがある。
// dateAddedってどんな値？16桁でなぜか最後の3桁はぜんぶ000だ。
// JavaScript.Date.dateTime が13桁で最近の時刻の先頭は13になるが…これの1000倍？
// 1970/1/1からのマイクロ秒でいいのかな？そうすると1000で割ればJavaScript.Date.getTime値になるのかな？
// http://www.forensicswiki.org/wiki/Mozilla_Firefox_3_History_File_Format
// http://builder.japan.zdnet.com/html-css/sp_firefox-3-for-developer-2008/20381345/
// どうせsqlite3を使うならノードツリーもFirefoxを参考にsqlite3で管理した方が後々楽かな？
// ファイルの更新排他もsqlite3が勝手にやってくれるんだろうし…う～む。。
// そうすればマルチユーザ対応で必要なサーバ側での更新管理もSQLで簡単かな？わからんが。
// そうするとfaviconもFirefoxみたいにsqlite3にデータを入れて独自管理しまおうかという構想も出て
// ぶっちゃけFirefoxのplaces.sqliteの真似実装みたいにはなりそうだがまあそれは置いておいて…う～む。。
// SQLite⇔JSON変換をサーバ側でやることになるが、その遅延は無視できるレベルだろうか。
// 遅延というよりJSONパースもまだできない。SQLiteみたいなお手軽C言語用JSONライブラリはないのか。
// http://mattn.kaoriya.net/software/lang/c/20090702153947.htm
// http://blog.livedoor.jp/tek_nishi/archives/4950982.html
// http://mattn.kaoriya.net/software/lang/c/20110319225212.htm
// http://www.codeproject.com/Articles/20027/JSON-Spirit-A-C-JSON-Parser-Generator-Implemented
// http://www.json.org/json-ja.html
// 「picojson」というのが小さくて良さ気という噂だがC++テンプレート使いまくり。
// というか、JSONはデータ交換フォーマットなわけで、SQLiteはデータベースなわけで用途が違う気も…。
// しかしながら、ChromeはJSONで保存している。ChromeのfaviconデータはSQLite3のようだが。
// [Chrome:User Dataフォルダ]\Favicons は FirefoxのSQLite Managerで見れる。
// GitHub検索したらCのJSON実装いっぱいあるもよう。
// https://github.com/search?q=json&repo=&langOverride=&start_value=1&type=Repositories&language=C
// 自力実装する場合の参考[yacc&lexでJSONパーサを作る]
// http://d.hatena.ne.jp/htz/20090223/1235395481
//
// SQLite3インデックスはplaces.sqliteにもいくつか作られているようだ。これは検索を速くするためにMozillaが
// つけてるもので、このインデックスを有効利用できるようなSELECT文を発行すれば効率良く速いよってかんじ？
// どの属性キーにインデックスがついてるんだろう。
//
// SQLite3はコマンド版もsqlite3.exeだけという便利なかんじ。
// [SQLite 3 コマンドライン・インタフェースを使ってみる ]
// http://www.kkaneko.com/rinkou/addb/sqlitecommand.html
//	>sqlite3.exe "%APPDATA%\Mozilla\Firefox\Profiles\mju3pugh.default\places.sqlite"
//	SQLite version 3.7.13 2012-06-11 02:05:22
//	Enter ".help" for instructions
//	Enter SQL statements terminated with a ";"
//	sqlite> select * from moz_bookmarks_roots;
//	places|1
//	menu|2
//	toolbar|3
//	tags|4
//	unfiled|5
//	sqlite> .exit
// でも日本語がUTF8のようで文字化け読めない…orz
// [The Places database]
// https://developer.mozilla.org/ja/docs/The_Places_database
// [Firefox 3のブックマーク構造を理解しよう]
// http://builder.japan.zdnet.com/html-css/sp_firefox-3-for-developer-2008/20381503/
// [Firefox 3のブックマークデータを格納するmoz_bookmarksテーブル]
// http://builder.japan.zdnet.com/html-css/sp_firefox-3-for-developer-2008/20381345/
// [SQLite3に関するページ]
// http://idocsq.net/titles/41
// http://hp.vector.co.jp/authors/VA002803/sqlite/capi3-ja.htm
//
// * 頂点のエントリとしてparent=0のフォルダ(type=2)エントリが必ず存在し、その下にすべての
//   フォルダとブックマークがぶら下がっている前提。つまりparent=depth=0をトップノードとして特別扱い。
//   そうでないDBはあるのか？あったらイヤ。
// * Firefoxブックマーク管理画面とトップフォルダ並び順が同じにならない。
//   「すべてのブックマーク」の中に、「ブックマークツールバー」「ブクマークメニュー」「未整理」の順に
//   並んでいるが、places.sqliteの中身を見てもそんな順番には並んでいない。
//
UINT FirefoxJSON( sqlite3* db, FILE* fp, int parent, UINT* nextid, UINT depth, u_char* view )
{
	sqlite3_stmt* bookmarks;
	u_char* moz_bookmarks = "select id,type,fk,title,dateAdded from moz_bookmarks where parent=? order by position";
	UINT count=0;
	int rc;

	sqlite3_prepare( db, moz_bookmarks, -1, &bookmarks, 0 );
	sqlite3_bind_int( bookmarks, 1, parent );

sqlite3_step:
	rc = sqlite3_step( bookmarks );
	if( sqlite3_data_count( bookmarks ) ){
		if( rc==SQLITE_DONE || rc==SQLITE_ROW ){
			int type = sqlite3_column_int( bookmarks, 1 );
			const u_char* title = sqlite3_column_text( bookmarks, 3 );
			const u_char* dateAdded = sqlite3_column_text( bookmarks, 4 );
			UINT n;
			if( !dateAdded ) dateAdded = "";
			if( type==1 ){
				// ブックマーク
				int fk = sqlite3_column_int( bookmarks, 2 );
				sqlite3_stmt* places;
				u_char* moz_places = "select url,favicon_id from moz_places where id=?";
				int rc;
				sqlite3_prepare( db, moz_places, -1, &places, 0 );
				sqlite3_bind_int( places, 1, fk );
				rc = sqlite3_step( places );
				if( sqlite3_data_count( places ) ){
					if( rc==SQLITE_DONE || rc==SQLITE_ROW ){
						const u_char* url="";
						const u_char* favicon_url="";
						// faviconURL取得
						sqlite3_stmt* favicons;
						u_char* moz_favicons = "select url from moz_favicons where id=?";
						int favicon_id = sqlite3_column_int( places, 1 );
						int rc;
						sqlite3_prepare( db, moz_favicons, -1, &favicons, 0 );
						sqlite3_bind_int( favicons, 1, favicon_id );
						rc = sqlite3_step( favicons );
						if( sqlite3_data_count( favicons ) ){
							if( rc==SQLITE_DONE || rc==SQLITE_ROW ){
								favicon_url = sqlite3_column_text( favicons, 0 );
							}
						}
						// URL取得
						url = sqlite3_column_text( places, 0 );
						// place:ではじまるURLは無視
						if( url && strnicmp(url,"place:",6) ){
							u_char* titleJSON = NULL;
							if( title && *title )
								titleJSON = strndupJSON( title, strlen(title) );
							else
								title = "(無題)";
							if( !favicon_url )
								favicon_url = "";
							// 仮URL(http://www.mozilla.org/../made-up-favicon/..)除外
							if( strstr(favicon_url,"://www.mozilla.org/") && strstr(favicon_url,"/made-up-favicon/") )
								favicon_url = "";
							if( view ){
								if( count ) fputs("\r\n",fp);
								for( n=depth+1; n; n-- ) fputs("\t",fp);
							}
							if( count ) fputs(",",fp);
							fprintf(fp,
									"{\"id\":%u"
									",\"dateAdded\":%I64u"
									",\"title\":\"%s\""
									",\"url\":\"%s\""
									",\"icon\":\"%s\"}"
									,(*nextid)++
									,_strtoui64(dateAdded,NULL,10)/1000
									,titleJSON? titleJSON : title
									,url
									,favicon_url
							);
							if( titleJSON ) free( titleJSON );
							count++;
						}
						sqlite3_finalize( favicons );
					}
				}
				sqlite3_finalize( places );
			}
			else if( type==2 ){
				// フォルダ
				int id = sqlite3_column_int( bookmarks, 0 );
				u_char* titleJSON = NULL;
				if( depth ){
					if( title && *title )
						titleJSON = strndupJSON( title, strlen(title) );
					else
						title = "(無題)";
				}
				else{
					// ルートノード
					fprintf(fp,
							"{\"id\":%u"
							",\"dateAdded\":%I64u"
							",\"title\":\"root\""
							",\"child\":["
							,(*nextid)++
							,JSTime()
					);
					if( view ) fputs("\r\n",fp);
					title = "Firefoxブックマーク";
				}
				if( view ){
					if( count ) fputs("\r\n",fp);
					for( n=depth+1; n; n-- ) fputs("\t",fp);
				}
				if( count ) fputs(",",fp);
				fprintf(fp,
						"{\"id\":%u"
						",\"dateAdded\":%I64u"
						",\"title\":\"%s\""
						",\"child\":["
						,(*nextid)++
						,_strtoui64(dateAdded,NULL,10)/1000
						,titleJSON? titleJSON : title
				);
				if( titleJSON ) free( titleJSON );
				if( view ) fputs("\r\n",fp);
				// 再帰
				if( FirefoxJSON( db, fp, id, nextid, depth+1, view ) >0 ){
					if( view ) fputs("\r\n",fp);
				}
				if( view ) for( n=depth+1; n; n-- ) fputs("\t",fp);
				fputs("]}",fp);
				count++;
			}
			// 次エントリ。depth=0は除外(しないとごみ箱エントリが上書きされた不正形式になる)
			if( depth ){
				if( rc==SQLITE_ROW ) goto sqlite3_step;
			}
			else{
				if( view && count >0 ) fputs("\r\n",fp);
				// ごみ箱
				fprintf(fp,
						",{\"id\":%u"
						",\"dateAdded\":%I64u"
						",\"title\":\"ごみ箱\""
						",\"child\":[]}]"
						",\"nextid\":%u}"
						,*nextid
						,JSTime()
						,*nextid +1
				);
				(*nextid) += 2;
			}
		}
		else LogW(L"sqlite3_stepエラー%u",rc);
	}
	sqlite3_finalize( bookmarks );
	return count;
}



//--------------------------------------------------------------------------------------------------------------
// Chromeブックマークファイルパス取得
// [Google Chromeの同期について 先日パソコンを購入しました。]
// http://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q1348120633
//   Windows XP
//   %USERPROFILE%\Local Settings\Application Data\Google\Chrome\User Data
//   Windows Vista
//   %USERPROFILE%\AppData\Local\Google\Chrome\User Data
// [The Chromium Projects > User Data Directory]
// http://www.chromium.org/user-experience/user-data-directory
//   Windows XP
//   Google Chrome: C:\Documents and Settings\<username>\Local Settings\Application Data\Google\Chrome\User Data\Default
//   Chromium: C:\Documents and Settings\<username>\Local Settings\Application Data\Chromium\User Data\Default
//   Windows 7 or Vista
//   Google Chrome: C:\Users\<username>\AppData\Local\Google\Chrome\User Data\Default
//   Chromium: C:\Users\<username>\AppData\Local\Chromium\User Data\Default
// %USERPROFILE%を使えばいいかな…？
// %APPDATA%は？ググっても見つからない。一般的な環境変数ではないのか？Firefoxでは使ってるが…。
// TODO:chrome.exe 起動オプション --user-data-dir で User Dataフォルダを指定できるらしい(?)
// その場合そっちの Bookmarks ファイルを見に行くには…ユーザ入力の設定項目を作るしかないか…。
//
WCHAR* ChromeBookmarksPathAlloc( void )
{
	OSVERSIONINFOA os;
	WCHAR* path = L"%USERPROFILE%\\Local Settings\\Application Data\\Google\\Chrome\\User Data\\Default\\Bookmarks";
	WCHAR* fullpath;
	DWORD length;
	// [WindowsのOS判定]
	// http://cherrynoyakata.web.fc2.com/sprogram_1_3.htm
	// http://www.westbrook.jp/Tips/Win/OSVersion.html
	memset( &os, 0, sizeof(os) );
	os.dwOSVersionInfoSize = sizeof(os);
	GetVersionExA( &os );
	if( os.dwMajorVersion>=6 ) // Vista以降
		path = L"%USERPROFILE%\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Bookmarks";
	length = ExpandEnvironmentStringsW( path, NULL, 0 );
	fullpath = (WCHAR*)malloc( length *sizeof(WCHAR) );
	if( fullpath ) ExpandEnvironmentStringsW( path, fullpath, length ); // 環境変数展開
	else LogW(L"L%u:mallocエラー",__LINE__);
	return fullpath;
}

// Chrome Bookmarks と同じフォルダの Favicons ファイルパス
WCHAR* ChromeFaviconsPathAlloc( void )
{
	WCHAR* path = ChromeBookmarksPathAlloc();
	if( path ){
		WCHAR* p = wcsrchr( path, L'\\' );
		if( p ){
			wcscpy( p+1, L"Favicons" );
			return path;
		}
		free( path );
	}
	return NULL;
}
// Chromeのfaviconデータ(SQLite3)からJSONイメージを作成する。
// {
//     "サイトURL": "faviconURL",
//     "サイトURL": "faviconURL",
//         :
// }
// [Chrome:User Dataフォルダ]\Default\Faviconsは、テーブル favicons の url が
// faviconURL、image_data が画像データ、id は、テーブル icon_mapping の icon_id
// に対応づいているもよう。サイトURLは、テーブル icon_mapping の url にある。
// やりたいことは、テーブル icon_mapping の url に対応する、テーブル favicons の
// url をぜんぶ取得すること。
// 実装は、まずテーブル icon_mapping の url をぜんぶ取得して、１エントリずつ対応
// するテーブル favicons の url を取得するのかな…。テーブル favicons を検索する
// 回数が多いけど、もっと楽に対応づけを一気に取得する方法が…わからん。
UINT ChromeFaviconJSON( sqlite3* db, FILE* fp, u_char* view )
{
	sqlite3_stmt* icon_mapping;
	sqlite3_stmt* favicons;
	u_char* select_icon_mapping = "select page_url,icon_id from icon_mapping";
	u_char* select_favicons = "select url from favicons where id=?";
	UINT count=0;
	int rc;

	sqlite3_prepare( db, select_icon_mapping, -1, &icon_mapping, 0 );
	sqlite3_prepare( db, select_favicons, -1, &favicons, 0 );

  sqlite3_step:
	rc = sqlite3_step( icon_mapping );
	if( sqlite3_data_count( icon_mapping ) ){
		if( rc==SQLITE_DONE || rc==SQLITE_ROW ){
			const u_char* page_url = sqlite3_column_text( icon_mapping, 0 );
			int icon_id = sqlite3_column_int( icon_mapping, 1 );
			if( page_url && *page_url ){
				int rc;
				sqlite3_bind_int( favicons, 1, icon_id );
				rc = sqlite3_step( favicons );
				if( sqlite3_data_count( favicons ) ){
					if( rc==SQLITE_DONE || rc==SQLITE_ROW ){
						const u_char* url = sqlite3_column_text( favicons, 0 );
						if( url && *url ){
							if( count ){
								fputc(',',fp);
							}
							else{
								fputc('{',fp);
							}
							fprintf(fp,"\"%s\":\"%s\"",page_url,url);
							count++;
						}
					}
				}
				sqlite3_clear_bindings( favicons );
				sqlite3_reset( favicons );
			}
			// 次エントリ
			if( rc==SQLITE_ROW ) goto sqlite3_step;
		}
		else LogW(L"sqlite3_stepエラー%u",rc);
	}
	sqlite3_finalize( favicons );
	sqlite3_finalize( icon_mapping );
	if( count ) fputc('}',fp);
	return count;
}



//---------------------------------------------------------------------------------------------------------------
// ファイルがあったらバックアップファイル作成
// TODO:複数世代つくる？
BOOL FileBackup( const WCHAR* path )
{
	if( path && *path ){
		HANDLE rFile = CreateFileW( path
							,GENERIC_READ
							,FILE_SHARE_READ |FILE_SHARE_WRITE |FILE_SHARE_DELETE
							,NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL
		);
		if( rFile !=INVALID_HANDLE_VALUE ){
			BOOL success = FALSE;
			WCHAR* tmp = wcsjoin( path, L".$$$" );
			WCHAR* bak = wcsjoin( path, L".bak" );
			if( tmp && bak ){
				HANDLE wFile = CreateFileW( tmp, GENERIC_WRITE, 0
									,NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL
				);
				if( wFile !=INVALID_HANDLE_VALUE ){
					// 連続領域確保（断片化抑制）
					SetFilePointer( wFile, GetFileSize(rFile,NULL), NULL, FILE_BEGIN );
					SetEndOfFile( wFile );
					SetFilePointer( wFile, 0, NULL, FILE_BEGIN );
					for( ;; ){
						BYTE buf[1024];
						DWORD bRead=0;
						if( ReadFile( rFile, buf, sizeof(buf), &bRead, NULL ) ){
							if( bRead ){
								DWORD bWrite=0;
								if( WriteFile( wFile, buf, bRead, &bWrite, NULL ) && bRead==bWrite )
									;
								else
									LogW(L"L%u:WiteFileエラー%u",__LINE__,GetLastError());
							}
							else break;
						}
						else{
							LogW(L"L%u:ReadFileエラー%u",__LINE__,GetLastError());
							break;
						}
					}
					SetEndOfFile( wFile );
					CloseHandle( wFile );
					if( MoveFileExW( tmp, bak ,MOVEFILE_REPLACE_EXISTING |MOVEFILE_WRITE_THROUGH )){
						LogW(L"バックアップ作成:%s",bak);
						success = TRUE;
					}
					else LogW(L"L%u:MoveFileEx(%s)エラー",__LINE__,tmp);
				}
				else LogW(L"L%u:CreateFile(%s)エラー",__LINE__,tmp);
			}
			if( tmp ) free( tmp );
			if( bak ) free( bak );
			CloseHandle( rFile );
			return success;
		}
	}
	return TRUE;
}

// ドキュメントルート配下のフルパスに変換する
WCHAR* RealPath( const u_char* path, WCHAR* realpath, size_t size )
{
	if( path && realpath ){
		WCHAR* wpath = UTF8toWideCharAlloc( path );
		if( wpath ){
			WCHAR* p;
			_snwprintf(realpath,size,L"%s\\%s",DocumentRoot,wpath);
			realpath[size-1]=L'\0';
			// パス区切りを \ に
			for( p=realpath; *p; p++ ){
				if( *p==L'/' ) *p = L'\\';
			}
			// 連続 \ を削除
			p = realpath;
			while( (p=wcsstr(p,L"\\\\")) ){
				WCHAR* next;
				for( next=p+2; *next; next++ ){
					if( *next !=L'\\' ) break;
				}
				if( *next ){
					memmove( p+1, next, (size - (next - realpath)) *sizeof(WCHAR) );
					p++;
				}
				else{
					*p = L'\0';
					break;
				}
			}
			// \..\ を削除
			p = realpath;
			while( (p=wcsstr(p,L"\\..\\")) ){
				WCHAR* prev;
				for( prev=p-1; realpath<prev; prev-- ){
					if( *prev==L'\\' ) break;
				}
				if( *prev==L'\\' ){
					memmove( prev+1, p+4, (size - (p+4 - realpath)) *sizeof(WCHAR) );
					p = prev;
				}
				else{
					memmove( p, p+3, (size - (p+3 - realpath)) *sizeof(WCHAR) );
					p++;
				}
			}
			free( wpath );
		}
	}
	return realpath;
}

// ファイルを全部メモリに読み込む。CreateFileMappingのがはやい…？
u_char* file2memory( const WCHAR* path )
{
	if( path && *path ){
		HANDLE hFile = CreateFileW( path
							,GENERIC_READ
							,FILE_SHARE_READ |FILE_SHARE_WRITE |FILE_SHARE_DELETE
							,NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL
		);
		if( hFile != INVALID_HANDLE_VALUE ){
			DWORD size = GetFileSize( hFile,NULL );
			u_char* memory = (u_char*)malloc( size +1 );
			if( memory ){
				DWORD bRead=0;
				if( ReadFile( hFile, memory, size, &bRead, NULL ) && bRead==size ){
					CloseHandle( hFile );
					memory[size] = '\0';
					return memory;
				}
				LogW(L"L%u:ReadFileエラー%u",__LINE__,GetLastError());
				CloseHandle( hFile );
				free( memory );
				return NULL;
			}
			LogW(L"L%u:malloc(%u)エラー",__LINE__,size+1);
			CloseHandle( hFile );
			return NULL;
		}
		LogW(L"L%u:CreateFile(%s)エラー",__LINE__,path);
		return NULL;
	}
	return NULL;
}



//-----------------------------------------------------------------------------------------------------------------
// multipart/form-dataのPOSTデータを処理する。いまのところHTMLインポート機能でのみ利用。
// POSTデータ(リクエスト本文)は、この関数呼出前に一時ファイル(tmppath)にそのまま出力されている。
// この関数から戻った後は、ファイルがクローズされてレスポンス送信処理(SEND_READY)に移るので、
// この関数は必ずレスポンス送信準備が完了した状態で終了しなければならない。
// [multipart/form-data]
// http://www.kanzaki.com/docs/html/htminfo32.html#enctype
// Content-Type: multipart/form-data; boundary=XXX
//
// --XXX
// Content-disposition: form-data; name="xxx"; filename="xxx"
// Content-Type: xxx
//
// xxx
// --XXX
// Content-disposition: form-data; name="xxx"; filename="xxx"
// Content-Type: xxx
//
// xxx
// --XXX--
//
void MultipartFormdataProc( TClient* cp, WCHAR* tmppath )
{
	u_char* path = cp->req.path;
	if( *path=='/' ) path++;
	if( stricmp(path,"import.html")==0 && cp->req.ContentLength <1024*1024*10 ){ // 10MB未満なんとなく
		// HTMLインポート
		// multipart/form-dataの形式チェックはしない。
		// 1パートのみエンコードされていないプレーンテキスト前提。
		// NETSCAPE-Bookmark-file-1 形式を JSON に変換する。
		// 文字コードはUTF-8前提。チェックはしない。
		u_char* data = file2memory( tmppath );
		if( data ){
			FILE* fp = _wfopen( tmppath, L"wb" );
			if( fp ){
				u_char* folderNameTop=NULL, *folderNameEnd=NULL;
				u_char* folderDateTop=NULL, *folderDateEnd=NULL;
				BYTE comment=0, doctype=0, topentry=0;
				UINT nextid=3;
				UINT count=0;
				int depth=0;
				u_char last='\0';
				u_char* p;
				for( p=data; *p; p++ ){
					if( strncmp(p,"<!-",3)==0 ){
						comment=1;
						p += 2;
						continue;
					}
					if( comment ){
						if( strncmp(p,"->",2)==0 ){
							comment=0;
							p++;
						}
						continue;
					}
					if( strnicmp(p,"<!DOCTYPE NETSCAPE-Bookmark-file-1>",35)==0 ){
						doctype=1;
						p += 34;
						continue;
					}
					// <H1>トップエントリタイトル</H1>
					if( doctype && strnicmp(p,"<H1>",4)==0 ){
						folderNameTop = p + 4;
						folderNameEnd = stristr(folderNameTop,"</H1>");
						if( folderNameEnd ){
							// ルートエントリ・トップエントリ
							u_char* strJSON = strndupJSON( folderNameTop, folderNameEnd - folderNameTop );
							fputs("{\"id\":1,\"title\":\"root\",\"child\":[{\"id\":2,\"title\":\"", fp);
							if( strJSON ){
								fputs( strJSON, fp );
								free( strJSON );
							}
							fputs("\",\"child\":[", fp);
							topentry=1;
							doctype=0;
							last='[';
							p = folderNameEnd + 4;
							continue;
						}
					}
					if( topentry ){
						// <DL><p>
						//   <DT><A HREF="ブックマークURL" ...>タイトル</A>
						//   <DT><H3 ADD_DATE="..">フォルダ名</H3>
						//   <DL><p>
						//     <DT><A HREF="ブックマークURL" ...
						//   </DL><p>
						// </DL><p>
						if( strnicmp(p,"<DL><p>",7)==0 ){
							depth++;
							if( depth>1 ){
								// フォルダ
								if( last=='}' ) fputc(',',fp);
								fprintf(fp,"{\"id\":%u,\"title\":\"",nextid++);
								if( folderNameTop && folderNameEnd ){
									u_char* strJSON = strndupJSON( folderNameTop, folderNameEnd - folderNameTop );
									if( strJSON ){
										fputs( strJSON, fp );
										free( strJSON );
									}
								}
								fputs("\",\"dateAdded\":\"",fp);
								if( folderDateTop && folderDateEnd )
									fwrite( folderDateTop, 1, folderDateEnd - folderDateTop, fp );
								fputs("\",\"child\":[",fp);
								last='[';
								count=0;
							}
							p += 6;
							continue;
						}
						if( strnicmp(p,"</DL><p>",8)==0 ){
							depth--;
							if( depth<=0 ){
								// 最後の閉じタグ。ごみ箱エントリ出力して終了。
								fprintf(fp,
										"]},{\"id\":%u,\"title\":\"ごみ箱\",\"child\":[]}],\"nextid\":%u}"
										,nextid
										,nextid+1
								);
								nextid += 2;
								break;
							}
							// フォルダ終わり
							fputs("]}", fp);
							last='}';
							p += 7;
							continue;
						}
						// <DT><H3 ADD_DATE="..">フォルダ名</H3>
						if( strnicmp(p,"<DT><H3",7)==0 ){
							folderNameTop = strchr(p+7,'>');
							if( folderNameTop ){
								folderDateTop = stristr(p+7," ADD_DATE=\"");
								if( folderDateTop && folderDateTop < folderNameTop ){
									folderDateTop += 11;
									folderDateEnd = strchr(folderDateTop,'"');
								}
								p = folderNameTop;
								folderNameTop++;
								folderNameEnd = stristr(folderNameTop,"</H3>");
								if( folderNameEnd ) p = folderNameEnd + 4;
							}
							else p += 6;
							continue;
						}
						// <DT><A HREF="ブックマークURL" ADD_DATE=".." ICON_URI="..">タイトル</A>
						if( strnicmp(p,"<DT><A ",7)==0 ){
							u_char* titleTop = strchr(p+7,'>');
							u_char* titleEnd = NULL;
							if( titleTop ){
								u_char* urlTop = stristr(p+6," HREF=\"");
								u_char* dateTop = stristr(p+6," ADD_DATE=\"");
								u_char* iconTop = stristr(p+6," ICON_URI=\"");
								u_char* urlEnd = NULL;
								u_char* dateEnd = NULL;
								u_char* iconEnd = NULL;
								if( urlTop && urlTop < titleTop ){
									urlTop += 7;
									urlEnd = strchr(urlTop,'"');
								}
								if( dateTop && dateTop < titleTop ){
									dateTop += 11;
									dateEnd = strchr(dateTop,'"');
								}
								if( iconTop && iconTop < titleTop ){
									iconTop += 11;
									iconEnd = strchr(iconTop,'"');
								}
								p = titleTop;
								titleTop++;
								titleEnd = stristr(titleTop,"</A>");
								if( titleEnd ) p = titleEnd + 3;
								// 書き出し
								if( last=='}' ) fputc(',',fp);
								fprintf(fp,"{\"id\":%u,\"url\":\"",nextid++);
								if( urlTop && urlEnd )
									fwrite( urlTop, 1, urlEnd - urlTop, fp );
								fputs("\",\"title\":\"",fp);
								if( titleTop && titleEnd ){
									u_char* strJSON = strndupJSON( titleTop, titleEnd - titleTop );
									if( strJSON ){
										fputs( strJSON, fp );
										free( strJSON );
									}
								}
								fputs("\",\"dateAdded\":\"",fp);
								if( dateTop && dateEnd )
									fwrite( dateTop, 1, dateEnd - dateTop, fp );
								fputs("\",\"icon\":\"",fp);
								if( iconTop && iconEnd ){
									*iconEnd = '\0';
									if( stristr(iconTop,"://www.mozilla.org/") && stristr(iconTop,"/made-up-favicon/") )
										; // Mozilla仮URL無視
									else fwrite( iconTop, 1, iconEnd - iconTop, fp );
									*iconEnd = '"';
								}
								fputs("\"}",fp);
								last='}';
							}
							else p += 6;
							continue;
						}
					}
				}
				fclose( fp );
				// GETとおなじ処理になっとる…
				cp->rsp.readfh = CreateFileW( tmppath
						,GENERIC_READ
						,FILE_SHARE_READ |FILE_SHARE_WRITE |FILE_SHARE_DELETE
						,NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL
				);
				if( cp->rsp.readfh ){
					SYSTEMTIME st;
					u_char inetTime[INTERNET_RFC1123_BUFSIZE];
					GetSystemTime( &st );
					InternetTimeFromSystemTimeA(&st,INTERNET_RFC1123_FORMAT,inetTime,sizeof(inetTime));
					ClientSendf(cp,
							"HTTP/1.0 200 OK\r\n"
							"Date: %s\r\n"
							"Content-Length: %u\r\n"
							"Content-Type: text/plain; charset=utf-8\r\n"
							"Connection: close\r\n"
							"\r\n"
							,inetTime
							,GetFileSize(cp->rsp.readfh,NULL)
					);
				}
				else{
					LogW(L"[%u]CreateFile(%s)エラー%u",Num(cp),tmppath,GetLastError());
					ClientSendErr(cp,"500 Internal Server Error");
				}
			}
			else{
				LogW(L"[%u]fopen(%s)エラー",Num(cp),tmppath);
				ClientSendErr(cp,"500 Internal Server Error");
			}
			free( data );
		}
		else ClientSendErr(cp,"500 Internal Server Error");
	}
	else ClientSendErr(cp,"400 Bad Request");
}

void SocketAccept( SOCKET sock )
{
	SOCKET				sock_new;
	SOCKADDR_STORAGE	addr;
	int					addrlen = sizeof(addr);
	// クライアントと接続されたソケットを取得
	sock_new = accept( sock, (SOCKADDR*)&addr, &addrlen );
	if( sock_new !=INVALID_SOCKET ){
		BOOL success = FALSE;
		WCHAR ip[INET6_ADDRSTRLEN+1]=L""; // IPアドレス文字列
		// GetNameInfoW は XP SP2 以降のAPIらしい
		// Win7だと127.0.0.1は「::1」これはIPv6のloopbackアドレス表記らしい
		GetNameInfoW( (SOCKADDR*)&addr, addrlen, ip, sizeof(ip)/sizeof(WCHAR), NULL, 0, NI_NUMERICHOST );
		// クライアントと接続確立したので、次
		// ソケットにデータが届いた(FD_READ)または相手が切断した(FD_CLOSE)ら、メッセージ
		// が来るようにする。その時lParamにFD_READまたはFD_CLOSEが格納されている。
		if( WSAAsyncSelect( sock_new, MainForm, WM_SOCKET, FD_READ |FD_WRITE |FD_CLOSE )==0 ){
			TClient* cp = ClientOfSocket(INVALID_SOCKET);
			if( cp ){
				LogW(L"[%u]接続:%s",Num(cp),ip);
				#define CLIENT_BUFSIZE 512	// 初期バッファサイズ。拡大は滅多にない程度の大きさに調節。
				cp->req.buf = (u_char*)malloc( CLIENT_BUFSIZE );
				cp->rsp.buf = (u_char*)malloc( CLIENT_BUFSIZE );
				if( cp->req.buf && cp->rsp.buf ){
					cp->req.bufsize = cp->rsp.bufsize = CLIENT_BUFSIZE;
					cp->sock = sock_new;
					cp->status = CLIENT_ACCEPT_OK;
					success = TRUE;
				}
				else{
					LogW(L"L%u:mallocエラー",__LINE__);
					if( cp->req.buf ) free(cp->req.buf), cp->req.buf=NULL;
					if( cp->rsp.buf ) free(cp->rsp.buf), cp->rsp.buf=NULL;
				}
			}
			else LogW(L"[%u]同時接続数オーバー切断:%s",sock_new,ip);
		}
		else LogW(L"[%u]WSAAsyncSelectエラー(%u)",sock_new,WSAGetLastError());

		if( !success ){
			shutdown( sock_new, SD_BOTH );
			closesocket( sock_new );
		}
	}
	else LogW(L"acceptエラー(%u)",WSAGetLastError());
}

void SocketWrite( SOCKET sock )
{
	TClient* cp = ClientOfSocket( sock );
	if( cp ){
		Response* rsp = &(cp->rsp);
		switch( cp->status ){
		case CLIENT_SEND_READY:
			// 送信準備完了,この時点で送信バッファはテキスト情報のみ(後になるとバイナリも入る)
			LogA("[%u]送信:%s",Num(cp),rsp->buf);
			// スレッドは終了してるはず
			CloseHandle( cp->thread ), cp->thread=NULL;
			rsp->sended = rsp->readed = 0;
			cp->status = CLIENT_SENDING;

		case CLIENT_SENDING:
		send_more:
			// まず送信バッファを送る
			if( rsp->sended < rsp->bytes ){
				int ret = send( sock, rsp->buf + rsp->sended, rsp->bytes - rsp->sended, 0 );
				if( ret==SOCKET_ERROR ){
					ret = WSAGetLastError();
					if( ret!=WSAEWOULDBLOCK	)	// 頻発するので記録しない
						LogW(L"[%u]sendエラー(%u)",Num(cp),ret);
					// 送信中止、再度FD_WRITEが来る(はず？)のを待つ
					break;
				}
				rsp->sended += ret;
				// 送信処理ループ
				goto send_more;
			}
			// 送信バッファ送ったらファイルを…
			if( rsp->readfh != INVALID_HANDLE_VALUE ){
				if( rsp->readed < GetFileSize(rsp->readfh,NULL) ){
					// バッファに読み込んで(上書き)
					DWORD bRead=0;
					if( ReadFile( rsp->readfh, rsp->buf, rsp->bufsize, &bRead, NULL )==0 )
						LogW(L"L%u:ReadFileエラー%u",__LINE__,GetLastError());
					rsp->readed += bRead;
					rsp->bytes = bRead;
					rsp->sended = 0;
					// 送信処理ループ
					goto send_more;
				}
				// ファイルデータ全部送った
				CloseHandle( rsp->readfh );
				rsp->readfh = INVALID_HANDLE_VALUE;
			}
			// ぜんぶ送信したら切断
			LogW(L"[%u]切断",Num(cp));
			ClientShutdown( cp );
			break;

		default:// 何もしない
			break;
		}
	}
	else{
		LogW(L"[%u]対応するクライアントバッファなし切断します",sock);
		shutdown( sock, SD_BOTH );
		closesocket( sock );
	}
}

void SocketRead( SOCKET sock, BrowserIcon browser[BI_COUNT] )
{
	TClient* cp = ClientOfSocket( sock );
	if( cp ){
		WCHAR tmppath[MAX_PATH+1]=L"", realpath[MAX_PATH+1]=L"";
		Request* req = &(cp->req);
		int bytes;
		switch( cp->status ){
		case CLIENT_ACCEPT_OK:
		case CLIENT_RECV_MORE:
			// 受信
			bytes = req->bufsize - req->bytes - 1;
			bytes = recv( sock, req->buf + req->bytes, bytes, 0 );
			req->bytes += bytes;
			req->buf[req->bytes] = '\0';
			// リクエスト解析
			if( !req->body ){
				req->body = strstr(req->buf,"\r\n\r\n");
				if( req->body ){
					*req->body = '\0';
					req->body += 4;
				}
				else{
					req->body = strstr(req->buf,"\n\n");
					if( req->body ){
						*req->body = '\0';
						req->body += 2;
					}
				}
			}
			if( req->body ){
				// リクエストヘッダ部受信完了
				if( !req->method ){
					LogA("[%u]受信:%s",Num(cp),req->buf);
					req->head = strchr(req->buf,'\n');
					if( req->head ){
						u_char* ct = strHeaderValue(++req->head,"Content-Type");
						u_char* cl = strHeaderValue(  req->head,"Content-Length");
						u_char* ua = strHeaderValue(  req->head,"User-Agent");
						u_char* ims= strHeaderValue(  req->head,"If-Modified-Since");
						if( ct ) req->ContentType = chomp(ct);
						if( cl ){
							UINT n = 0;
							while( isdigit(*cl) ){
								n = n*10 + *cl - '0';
								cl++;
							}
							req->ContentLength = n; //LogW(L"%uバイトです",n);
						}
						if( ua ) req->UserAgent = chomp(ua);
						if( ims ) req->IfModifiedSince = chomp(ims);
					}
					req->method = chomp(req->buf);
					req->path =strchr(req->method,' ');
					if( req->path ){
						*req->path++ = '\0';
						req->ver = strchr(req->path,' ');
						if( req->ver ) *req->ver++ = '\0';
						req->param = strchr(req->path,'?');
						if( req->param ) *req->param++ = '\0';
					}
				}
				if( req->method && req->path && req->ver ){
					if( stricmp(req->method,"GET")==0 ){
						u_char* file = cp->req.path;
						if( *file=='/' ) file++;
						// リクエストファイル開く
						if( stricmp(file,":analyze")==0 && cp->req.param ){
							// Webページ解析
							// GET /:analyze?http://xxx/yyy HTTP/1.x
							// "%23"を"#"に戻す(TwitterのURLの/#!/対策)
							u_char* p = cp->req.param;
							u_char* end = strchr(p,'\0');
							while( p = strstr(p,"%23") ){
								*p++ = '#';
								memmove( p, p+2, end-p-1 );
							}
							cp->thread = (HANDLE)_beginthreadex( NULL, 0, analyze, (void*)cp, 0, NULL );
							Sleep(50);	// なんとなくちょっと待つ
							break; // スレッド終了まで何もしない
						}
						else if( stricmp(file,":browser.json")==0 ){
							// index.htmlサイドバーブラウザアイコン不要なものを表示しないための情報。
							//   {"chrome":0,"firefox":0,"ie":0,"opera":0}
							// クライアントでindex.html受信後にajaxでこれを取得して非表示にしているが、
							// そもそもサーバから返す時にHTML加工してしまう方が無駄がないような…。
							// それを言ってしまうとtree.jsonもサーバ側でHTMLにした方が無駄がない…。
							UINT count=0;
							ClientSends(cp,
									"HTTP/1.0 200 OK\r\n"
									"Content-Type: application/json\r\n"
									"Connection: close\r\n"
									"\r\n"
									"{"
							);
							if( browser ){
								if( browser[BI_IE].hwnd ){
									count++;
									ClientSends(cp,"\"ie\":1");
								}
								if( browser[BI_CHROME].hwnd ){
									if( count++ ) ClientSends(cp,",");
									ClientSends(cp,"\"chrome\":1");
								}
								if( browser[BI_FIREFOX].hwnd ){
									if( count++ ) ClientSends(cp,",");
									ClientSends(cp,"\"firefox\":1");
								}
								if( browser[BI_OPERA].hwnd ){
									if( count++ ) ClientSends(cp,",");
									ClientSends(cp,"\"opera\":1");
								}
							}
							ClientSends(cp,"}");
							goto send_ready;
						}
						else if( stricmp(file,":favorites.json")==0 ){
							// IEお気に入りインポート
							NodeList* list = FavoriteListCreate();
							if( list ){
								FILE* fp = _wfopen(ClientTempPath(cp,tmppath,sizeof(tmppath)/sizeof(WCHAR)),L"wb");
								if( fp ){
									UINT nextid=1;	// ノードID
									UINT depth=0;	// 階層深さ
									NodeListJSON( list, fp, &nextid, depth, cp->req.param );
									fclose( fp );
									if( nextid >1 ){
										cp->rsp.readfh = CreateFileW( tmppath
												,GENERIC_READ
												,FILE_SHARE_READ |FILE_SHARE_WRITE |FILE_SHARE_DELETE
												,NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL
										);
									}
									else LogW(L"[%u]IEお気に入りデータありません",Num(cp));
								}
								else LogW(L"[%u]fopen(%s)エラー",Num(cp),tmppath);
								NodeListDestroy( list );
							}
						}
						else if( stricmp(file,":firefox.json")==0 ){
							// Firefoxブックマークインポート
							WCHAR* places = FirefoxPlacesPathAlloc();
							if( places ){
								sqlite3* db = NULL;
								if( sqlite3_open16( places, &db )==SQLITE_OK ){
									FILE* fp = _wfopen(ClientTempPath(cp,tmppath,sizeof(tmppath)/sizeof(WCHAR)),L"wb");
									if( fp ){
										int parent=0;	// places.sqliteルートエントリparentID
										UINT nextid=1;	// ノードID
										UINT depth=0;	// 階層深さ
										FirefoxJSON( db, fp, parent, &nextid, depth, cp->req.param );
										fclose( fp );
										if( nextid >1 ){
											cp->rsp.readfh = CreateFileW( tmppath
													,GENERIC_READ
													,FILE_SHARE_READ |FILE_SHARE_WRITE |FILE_SHARE_DELETE
													,NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL
											);
										}
										else LogW(L"[%u]Firefoxブックマークデータありません",Num(cp));
									}
									else LogW(L"[%u]fopen(%s)エラー",Num(cp),tmppath);
									sqlite3_close( db );
								}
								else LogW(L"[%u]sqlite3_open16(%s)エラー%s",Num(cp),places,sqlite3_errmsg16(db));
								free( places );
							}
						}
						else if( stricmp(file,":chrome.json")==0 ){
							// Chromeブックマークインポート
							WCHAR* path = ChromeBookmarksPathAlloc();
							if( path ){
								cp->rsp.readfh = CreateFileW( path
										,GENERIC_READ
										,FILE_SHARE_READ |FILE_SHARE_WRITE |FILE_SHARE_DELETE
										,NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL
								);
								free( path );
							}
						}
						else if( stricmp(file,":chrome.icon.json")==0 ){
							// Chrome FaviconsをJSONに変換
							WCHAR* favicons = ChromeFaviconsPathAlloc();
							if( favicons ){
								sqlite3* db = NULL;
								if( sqlite3_open16( favicons, &db )==SQLITE_OK ){
									FILE* fp = _wfopen(ClientTempPath(cp,tmppath,sizeof(tmppath)/sizeof(WCHAR)),L"wb");
									if( fp ){
										UINT count = ChromeFaviconJSON( db, fp, cp->req.param );
										fclose( fp );
										if( count ){
											cp->rsp.readfh = CreateFileW( tmppath
													,GENERIC_READ
													,FILE_SHARE_READ |FILE_SHARE_WRITE |FILE_SHARE_DELETE
													,NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL
											);
										}
									}
									else LogW(L"[%u]fopen(%s)エラー",Num(cp),tmppath);
									sqlite3_close( db );
								}
								else LogW(L"[%u]sqlite3_open16(%s)エラー%s",Num(cp),favicons,sqlite3_errmsg16(db));
								free( favicons );
							}
						}
						else{
							// 通常ファイル,index.html補完
							size_t len = wcslen( RealPath(file,realpath,sizeof(realpath)/sizeof(WCHAR)) );
							if( realpath[len-1]==L'\\' ){
								_snwprintf(realpath+len,sizeof(realpath)/sizeof(WCHAR)-len,L"%s",L"index.html");
								realpath[sizeof(realpath)/sizeof(WCHAR)-1]=L'\0';
							}
							// ドキュメントルート配下のみ
							if( UnderDocumentRoot(realpath) ){
								cp->rsp.readfh = CreateFileW( realpath
										,GENERIC_READ
										,FILE_SHARE_READ |FILE_SHARE_WRITE |FILE_SHARE_DELETE
										,NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL
								);
							}
						}
						if( cp->rsp.readfh !=INVALID_HANDLE_VALUE ){
							FILETIME ft;
							SYSTEMTIME st;
							u_char inetTime[INTERNET_RFC1123_BUFSIZE];
							GetFileTime( cp->rsp.readfh, NULL, NULL, &ft );
							FileTimeToSystemTime( &ft, &st );
							InternetTimeFromSystemTimeA(&st,INTERNET_RFC1123_FORMAT,inetTime,sizeof(inetTime));
							if( cp->req.IfModifiedSince ){
								// FILETIMEそのままだとHTTP日付より精度が細かくて304判定されないので
								// 精度を(秒単位に)落として比較する。この精度落ちのせいで、1秒経たないうちに
								// 変更されたファイルで、本当は変更されてるのに304 Not Modifiedが返ってしまう
								// 場合があるのでは…？
								// あとJSONのバックアップ復旧した時＝ファイル時刻が過去に戻った時、ブラウザの
								// キャッシュがクリアされないと永遠に304が返り、ブラウザ表示が更新されない＝
								// 復旧したJSONで表示されないことになってしまう。どうするか…Pragma:no-cache
								// とかもCGIじゃないから変な気がするし…、ブラウザキャッシュをクリアしてくれ
								// ということでいいかな…？
								if( UINT64InetTime(cp->req.IfModifiedSince) >= UINT64InetTime(inetTime) ){
									ClientSends(cp,"HTTP/1.0 304 Not Modified\r\n");
									// ファイル中身送らない
									CloseHandle( cp->rsp.readfh );
									cp->rsp.readfh = INVALID_HANDLE_VALUE;
								}
								else goto _200_ok;
							}
							else{
							_200_ok:
								ClientSendf(cp,
										"HTTP/1.0 200 OK\r\n"
										"Content-Length: %u\r\n"
										,GetFileSize(cp->rsp.readfh,NULL)
								);
								if( stricmp(file,"export.html")==0 ){
									// エクスポートHTMLは特別扱い
									// Chrome,Firefoxでは octet-stream にするだけで保存ダイアログ出たけど
									// IE8は出てくれない。しょうがなくContent-Dispositionもつける。
									ClientSends(cp,
											"Content-Type: application/octet-stream\r\n"
											"Content-Disposition: attachment; filename=\"bookmark.html\"\r\n"
									);
								}
								else{
									ClientSendf(cp
											,"Content-Type: %s\r\n"
											,(*realpath)? FileContentTypeW(realpath) : FileContentTypeA(file)
									);
								}
								ClientSendf(cp,"Last-Modified: %s\r\n",inetTime);
							}
							GetSystemTime( &st );
							InternetTimeFromSystemTimeA(&st,INTERNET_RFC1123_FORMAT,inetTime,sizeof(inetTime));
							ClientSendf(cp,
									"Date: %s\r\n"
									"Connection: close\r\n"
									"\r\n"
									,inetTime
							);
						}
						else ClientSendErr(cp,"404 Not Found");
						goto send_ready;
					}
					else if( stricmp(req->method,"POST")==0 ){
						// HTMLインポート
						if( req->ContentLength ){
							ClientTempPath(cp,tmppath,sizeof(tmppath)/sizeof(WCHAR));
							// リクエスト本文を一時ファイルに書き出す
							// TODO:PUTとおなじ処理になっとる
							if( req->writefh==INVALID_HANDLE_VALUE ){
								if( req->ContentType && strnicmp(req->ContentType,"multipart/form-data;",20)==0 ){
									req->writefh = CreateFileW( tmppath
														,GENERIC_WRITE, 0, NULL
														,CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL
									);
									if( req->writefh !=INVALID_HANDLE_VALUE ){
										// 連続領域確保（断片化抑制）
										SetFilePointer( req->writefh, req->ContentLength, NULL, FILE_BEGIN );
										SetEndOfFile( req->writefh );
										SetFilePointer( req->writefh, 0, NULL, FILE_BEGIN );
									}
									else{
										LogW(L"[%u]CreateFile(%s)エラー%u",Num(cp),tmppath,GetLastError());
										ClientSendErr(cp,"500 Internal Server Error");
										goto send_ready;
									}
								}
								else{
									ClientSendErr(cp,"501 Not Implemented");
									goto send_ready;
								}
							}
							if( req->writefh !=INVALID_HANDLE_VALUE ){
								// Content-Lengthバイトぶんファイル出力
								// TODO:Content-Lengthぶんデータが来ない場合は待ち続けてしまう？
								// 無通信監視機能を入れないと対処できないか…
								DWORD bodybytes = req->bytes - (req->body - req->buf);
								DWORD bWrite=0;
								if( bodybytes > req->ContentLength - req->wrote )
									bodybytes = req->ContentLength - req->wrote;
								if( WriteFile( req->writefh, req->body, bodybytes, &bWrite, NULL )==0 )
									LogW(L"L%u:WiteFileエラー%u",__LINE__,GetLastError());
								memmove( req->body, req->body + bWrite, bodybytes - bWrite );
								req->bytes -= bWrite;
								req->wrote += bWrite;
								if( req->wrote >= req->ContentLength ){
									SetEndOfFile( req->writefh );
									CloseHandle( req->writefh );
									req->writefh = INVALID_HANDLE_VALUE;
									MultipartFormdataProc( cp, tmppath );
									goto send_ready;
								}
								else{
									// 受信してファイル出力続行
									cp->status = CLIENT_RECV_MORE;
								}
							}
						}
						else{
							ClientSendErr(cp,"400 Bad Request");
							goto send_ready;
						}
					}
					else if( stricmp(req->method,"PUT")==0 ){
						if( req->ContentLength ){
							u_char* file = req->path;
							if( *file=='/' ) file++;
							RealPath( file, realpath, sizeof(realpath)/sizeof(WCHAR) );
							ClientTempPath( cp, tmppath, sizeof(tmppath)/sizeof(WCHAR) );
							// リクエスト本文を一時ファイルに書き出す
							// TODO:POSTとおなじ処理になっとる
							if( req->writefh==INVALID_HANDLE_VALUE ){
								u_char* ext = strrchr(file,'.');
								// ドキュメントルート配下のJSONまたはexport.htmlのみ
								if( (ext && stricmp(ext,".json")==0 && UnderDocumentRoot(realpath))
									|| stricmp(file,"export.html")==0
								){
									req->writefh = CreateFileW( tmppath
														,GENERIC_WRITE, 0, NULL
														,CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL
									);
									if( req->writefh !=INVALID_HANDLE_VALUE ){
										// 連続領域確保（断片化抑制）
										SetFilePointer( req->writefh, req->ContentLength, NULL, FILE_BEGIN );
										SetEndOfFile( req->writefh );
										SetFilePointer( req->writefh, 0, NULL, FILE_BEGIN );
									}
									else{
										LogW(L"[%u]CreateFile(%s)エラー%u",Num(cp),tmppath,GetLastError());
										ClientSendErr(cp,"500 Internal Server Error");
										goto send_ready;
									}
								}
								else{
									LogA("[%u]PUTファイル名不正:%s",Num(cp),req->path);
									ClientSendErr(cp,"400 Bad Request");
									goto send_ready;
								}
							}
							if( req->writefh !=INVALID_HANDLE_VALUE ){
								// リクエスト本文をContent-Lengthバイトぶんファイル出力
								// TODO:Content-Lengthぶんデータが来ない場合は待ち続けてしまう？
								// 無通信監視機能を入れないと対処できないか・・
								DWORD bodybytes = req->bytes - (req->body - req->buf);
								DWORD bWrite=0;
								if( bodybytes > req->ContentLength - req->wrote )
									bodybytes = req->ContentLength - req->wrote;
								if( WriteFile( req->writefh, req->body, bodybytes, &bWrite, NULL )==0 )
									LogW(L"L%u:WiteFileエラー%u",__LINE__,GetLastError());
								memmove( req->body, req->body + bWrite, bodybytes - bWrite );
								req->bytes -= bWrite;
								req->wrote += bWrite;
								if( req->wrote >= req->ContentLength ){
									SetEndOfFile( req->writefh );
									CloseHandle( req->writefh );
									req->writefh = INVALID_HANDLE_VALUE;
									if( FileBackup( realpath ) ){
										if( MoveFileExW( tmppath, realpath
												,MOVEFILE_REPLACE_EXISTING |MOVEFILE_WRITE_THROUGH
										)){
											ClientSendErr(cp,"200 OK");
										}
										else{
											LogW(L"[%u]MoveFileEx(%s)エラー%u",Num(cp),tmppath,GetLastError());
											ClientSendErr(cp,"500 Internal Server Error");
										}
									}
									else ClientSendErr(cp,"500 Internal Server Error");
									goto send_ready;
								}
								else{
									// 受信してファイル出力続行
									cp->status = CLIENT_RECV_MORE;
								}
							}
						}
						else{
							LogW(L"[%u]PUTでContent-Lengthなし未対応",Num(cp));
							ClientSendErr(cp,"501 Not Implemented");
							goto send_ready;
						}
					}
					else{
						ClientSendErr(cp,"400 Bad Request");
						goto send_ready;
					}
				}
				else{
					ClientSendErr(cp,"400 Bad Request");
					goto send_ready;
				}
			}
			else if( req->bytes >= req->bufsize-1 ){
				// ヘッダ完了せずバッファいっぱい
				size_t newsize = req->bufsize * 2;
				u_char* newbuf = (u_char*)malloc( newsize );
				if( newbuf ){
					int distance = newbuf - req->buf;
					memcpy( newbuf, req->buf, req->bufsize );
					if( req->method ) req->method += distance;
					if( req->path ) req->path += distance;
					if( req->param ) req->param += distance;
					if( req->ver ) req->ver += distance;
					if( req->head ) req->head += distance;
					if( req->ContentType ) req->ContentType += distance;
					if( req->UserAgent ) req->UserAgent += distance;
					if( req->IfModifiedSince ) req->IfModifiedSince += distance;
					if( req->boundary ) req->boundary += distance;
					if( req->body ) req->body += distance;
					free( req->buf );
					req->buf = newbuf;
					req->bufsize = newsize;
					cp->status = CLIENT_RECV_MORE;
					LogW(L"[%u]受信バッファ拡大%ubytes",Num(cp),newsize);
				}
				else{
					LogA("[%u]リクエスト大杉:%s",Num(cp),req->buf);
					ClientSendErr(cp,"400 Bad Request");
				send_ready:
					cp->status = CLIENT_SEND_READY;
					SocketWrite( sock );
				}
			}
			else{
				// ヘッダ未完バッファもまだ空いてる
				cp->status = CLIENT_RECV_MORE;
			}
			break;

		default:
			{
				char* buf = (char*)malloc(1024*8);
				if( buf ){
					LogW(L"[%u]不正ステータス受信データ破棄(%u)",Num(cp),recv(sock,buf,1024*8,0));
					free( buf );
				}
			}
		}
	}
	else{
		LogW(L"[%u]対応するクライアントバッファなし切断します",sock);
		shutdown( sock, SD_BOTH );
		closesocket( sock );
	}
}

void SocketClose( SOCKET sock )
{
	TClient* cp = ClientOfSocket( sock );
	if( cp ){
		if( cp->status==CLIENT_THREADING ){
			// スレッド終了待たないとアクセス違反でプロセス落ちる
			cp->abort = 1;
			LogW(L"[%u]スレッド実行中待機...",Num(cp));
			Sleep(200);
			// もう一回おなじメッセージでこの関数を実行
			PostMessage( MainForm, WM_SOCKET, (WPARAM)sock, (LPARAM)FD_CLOSE );
			return;
		}
		LogW(L"[%u]切断(FD_CLOSE)",Num(cp));
		ClientShutdown( cp );
	}
	else{
		LogW(L"[%u]切断(FD_CLOSE)",sock);
		shutdown( sock, SD_BOTH );
		closesocket( sock );
	}
}
//
// 待ち受け開始
//
BOOL ListenStart( void )
{
	BOOL		success	= FALSE;
	SOCKET		sock	= INVALID_SOCKET;
	ADDRINFOA	hint;
	ADDRINFOA*	adr		= NULL;

	memset( &hint, 0, sizeof(hint) );
	hint.ai_socktype = SOCK_STREAM;
	hint.ai_protocol = IPPROTO_TCP;
	hint.ai_flags	 = AI_PASSIVE;

	if( getaddrinfo( NULL, ListenPort, &hint, &adr )==0 ){
		int on=1;
		sock = socket( adr->ai_family, adr->ai_socktype, adr->ai_protocol );
		//if( setsockopt( sock, SOL_SOCKET, SO_REUSEADDR, (char*)&on, sizeof(on) )!=SOCKET_ERROR ){	// zombie対策
		// Listenゾンビが発生した場合SO_REUSEADDRが有効。だが、副作用でポート競合しても(すでにListenされてても)
		// bindエラーにならず、ポートを奪い取ってしまうような挙動になる。自分のListenゾンビを奪うぶんにはいいが
		// 他アプリのポートだったら迷惑千万…やっぱポート重複エラーになってくれたほうがうれしい…
		if( 1 ){
			if( bind( sock, adr->ai_addr, (int)adr->ai_addrlen )!=SOCKET_ERROR ){
				#define BACKLOG 128
				if( listen( sock, BACKLOG )!=SOCKET_ERROR ){
					// 待ち受け開始したので、次
					// ソケットに接続要求が届いた(FD_ACCEPT)ら、メッセージが来るようにする。
					// その時 lParam に FD_ACCEPT が格納されている。
					if( WSAAsyncSelect( sock, MainForm, WM_SOCKET, FD_ACCEPT )==0 ){
						LogW(L"ポート%sで待機します - http://localhost:%s/",wListenPort,wListenPort);
						ListenSock = sock;
						success = TRUE;
					}
					else LogW(L"WSAAsyncSelectエラー(%u)",WSAGetLastError());
				}
				else LogW(L"listenエラー(%u)",WSAGetLastError());
			}
			else LogW(L"bindエラー(%u)",WSAGetLastError());
		}
		else LogW(L"setsockoptエラー(%u)",WSAGetLastError());

		freeaddrinfo( adr );
	}
	else LogW(L"getaddrinfoエラー(%u)",WSAGetLastError());

	if( !success ){
		if( sock !=INVALID_SOCKET ){
			shutdown( sock, SD_BOTH );
			closesocket( sock );
		}
		ListenSock = INVALID_SOCKET;
	}
	return success;
}

void SocketShutdown( void )
{
	BOOL retry;
	UINT i, count=0;

	if( ListenSock !=INVALID_SOCKET ){
		shutdown( ListenSock, SD_BOTH );
		closesocket( ListenSock );
		ListenSock = INVALID_SOCKET;
	}
retry:
	for( retry=FALSE, i=0; i<CLIENT_MAX; i++ ){
		if( Client[i].status==CLIENT_THREADING ){
			Client[i].abort = 1;
			LogW(L"[%u]スレッド実行中...",i);
			retry = TRUE;
		}
		else ClientShutdown( &(Client[i]) );
	}
	if( retry /*&& count++ <10*/ ){
		// スレッド実行中はこの関数から戻らないすなわちメインフォームは固まる。
		// 数秒以内にスレッドは終了するはずだが、念のため10秒くらいでおしまい。
		Sleep(1000);
		goto retry;
	}
}

// タスクトレイアイコン登録
// http://www31.ocn.ne.jp/~yoshio2/vcmemo17-1.html
BOOL TrayIconNotify( HWND hwnd, UINT msg )
{
	NOTIFYICONDATA data;

	memset( &data, 0, sizeof(data) );
	data.cbSize	= sizeof(data);
	data.hWnd	= hwnd;

	switch( msg ){
	case NIM_ADD:
		data.uFlags				= NIF_ICON |NIF_MESSAGE |NIF_TIP;
		data.uCallbackMessage	= WM_TRAYICON;
		data.hIcon				= TrayIcon;
		goto tip_create;
	case NIM_MODIFY:
		data.uFlags				= NIF_TIP;
	tip_create:
		GetWindowText( hwnd, data.szTip, sizeof(data.szTip) );
		break;
	}

	if( Shell_NotifyIcon( msg, &data ) ) return TRUE;

	if( msg!=NIM_DELETE ) ErrorBoxW(L"タスクトレイアイコンエラー(Shell_NotifyIcon)");
	return FALSE;
}

WCHAR* WindowTextAllocW( HWND hwnd )
{
	int len = GetWindowTextLengthW( hwnd ) + 1;
	WCHAR* text = (WCHAR*)malloc( len * sizeof(WCHAR) );
	if( text ) GetWindowTextW( hwnd, text, len );
	return text;
}

// タブアイテムのlParam(タブ識別IDを)が指定した値をもつタブインデックスを返却
int TabCtrl_GetSelHasLParam( HWND hTab, int lParam )
{
	int index;
	for( index=TabCtrl_GetItemCount(hTab)-1; index>=0; index-- ){
		TCITEM item;
		memset( &item, 0, sizeof(item) );
		item.mask = TCIF_PARAM;
		TabCtrl_GetItem( hTab, index, &item );
		if( item.lParam==lParam ) return index;
	}
	return -1;
}

// リソースを使わないモーダルダイアログ
// http://www.sm.rim.or.jp/~shishido/mdialog.html
// TODO:いらないブラウザボタンを非表示にするチェックボックスが欲しいかも。
// ボタンだけ非表示で設定画面のタブは存在する感じ。
// ダイアログ用ID
#define ID_DLG_UNKNOWN	0
#define ID_DLG_OK		1
#define ID_DLG_CANCEL	2
#define ID_DLG_FOPEN	3
#define ID_DLG_DESTROY	99
LRESULT CALLBACK ConfigDialogProc( HWND hwnd, UINT msg, WPARAM wp, LPARAM lp )
{
	static LPDWORD		lpRes;
	static HWND			hTabc, hOK, hCancel, hListenPort, hTxtListenPort
						,hTxtBtn=NULL, hTxtExe=NULL, hTxtArg=NULL, hFOpen=NULL
						,hHide[BI_COUNT]={0}, hExe[BI_COUNT]={0}, hArg[BI_COUNT]={0};
	static HICON		hIcon[BI_COUNT]={0};
	static HFONT		hFont;
	static HIMAGELIST	hImage;

	if( hwnd==NULL ){
		// 結果変数のアドレスを保存
		lpRes = (LPDWORD)msg;
		*lpRes = ID_DLG_UNKNOWN;
		return 0;
	}
	switch( msg ){
	case WM_CREATE:
		{
			HINSTANCE hinst = GetModuleHandle(NULL);
			BrowserInfo* br;
			TCITEMW item;
			UINT tabid;
			UINT i;

			hFont = CreateFontA(16,0,0,0,0,0,0,0,0,0,0,0,0,"MS UI Gothic");
			// タブコントロール
			// タブの数と内容は環境(ブラウザインストール状態)により変わるため、タブのインデックス値で
			// タブの識別はできない。そこでlParamにタブ識別IDを格納しておき、WM_NOTIFYではこのIDを
			// 取り出してタブを特定する。
			hTabc = CreateWindowW(
						WC_TABCONTROLW, L""
						,WS_CHILD |WS_VISIBLE |TCS_RIGHTJUSTIFY |TCS_MULTILINE
						,0,0,0,0 ,hwnd,NULL ,hinst,NULL
			);
			SendMessageA( hTabc, WM_SETFONT, (WPARAM)hFont, 0 );
			hImage = ImageList_Create( 16, 16, ILC_COLOR32 |ILC_MASK, 1, 5 );
			// アイコンイメージリスト背景色を描画先背景色と同じにする。しないと表示がギザギザ汚い。
			ImageList_SetBkColor( hImage, GetSysColor(COLOR_BTNFACE) );
			// HTTPサーバタブ(ID=0)
			item.mask = TCIF_TEXT |TCIF_IMAGE |TCIF_PARAM;
			item.pszText = L"HTTPサーバ";
			item.iImage = ImageList_AddIcon( hImage, TrayIcon );
			item.lParam = (LPARAM)0;					// タブ識別ID
			TabCtrl_InsertItem( hTabc, 0, &item );		// タブインデックス
			hTxtListenPort = CreateWindowW(
						L"static",L"待受ポート番号"
						,SS_SIMPLE |WS_CHILD
						,0,0,0,0 ,hwnd,NULL ,hinst,NULL
			);
			hListenPort = CreateWindowW(
						L"edit",wListenPort
						,ES_LEFT |WS_CHILD |WS_BORDER |WS_TABSTOP
						,0,0,0,0 ,hwnd,NULL ,hinst,NULL
			);
			SendMessageA( hTxtListenPort, WM_SETFONT, (WPARAM)hFont, 0 );
			SendMessageA( hListenPort, WM_SETFONT, (WPARAM)hFont, 0 );
			// ブラウザタブ(ID=1～8、Browserインデックス＋1)
			br = BrowserInfoAlloc();
			if( br ){
				for( tabid=1,i=0; i<BI_COUNT; i++, tabid++ ){
					if( br[i].exe || (BI_USER1<=i && i<=BI_USER4) ){
						hIcon[i] = FileIconLoad( br[i].exe );
						item.pszText = br[i].name;
						item.iImage = hIcon[i]? ImageList_AddIcon( hImage, hIcon[i] ) : -1;
						item.lParam = (LPARAM)tabid;				// タブ識別ID
						TabCtrl_InsertItem( hTabc, tabid, &item );	// タブインデックス
					}
				}
				hTxtBtn = CreateWindowW(
							L"static",L"ボタンを"
							,SS_SIMPLE |WS_CHILD
							,0,0,0,0 ,hwnd,NULL ,hinst,NULL
				);
				hTxtExe = CreateWindowW(
							L"static",L"実行ﾌｧｲﾙ"
							,SS_SIMPLE |WS_CHILD
							,0,0,0,0 ,hwnd,NULL ,hinst,NULL
				);
				hTxtArg = CreateWindowW(
							L"static",L"引 数"
							,SS_SIMPLE |WS_CHILD
							,0,0,0,0 ,hwnd,NULL ,hinst,NULL
				);
				hFOpen = CreateWindowA(
							"button",NULL // L"参照"
							,WS_CHILD |WS_VISIBLE |WS_TABSTOP |BS_ICON
							,0,0,0,0
							,hwnd,(HMENU)ID_DLG_FOPEN
							,hinst,NULL
				);
				SendMessageA( hTxtBtn, WM_SETFONT, (WPARAM)hFont, 0 );
				SendMessageA( hTxtExe, WM_SETFONT, (WPARAM)hFont, 0 );
				SendMessageA( hTxtArg, WM_SETFONT, (WPARAM)hFont, 0 );
				for( i=0; i<BI_COUNT; i++ ){
					hHide[i] = CreateWindowW(
								L"button",L"表示しない"
								,WS_CHILD |WS_VISIBLE |WS_TABSTOP |BS_CHECKBOX |BS_AUTOCHECKBOX
								,0,0,0,0 ,hwnd,NULL ,hinst,NULL
					);
					hExe[i] = CreateWindowW(
								L"edit",br[i].exe
								,ES_LEFT |WS_CHILD |WS_BORDER |WS_TABSTOP |ES_AUTOHSCROLL
								,0,0,0,0 ,hwnd,NULL ,hinst,NULL
					);
					hArg[i] = CreateWindowW(
								L"edit",br[i].arg
								,ES_LEFT |WS_CHILD |WS_BORDER |WS_TABSTOP |ES_AUTOHSCROLL
								,0,0,0,0 ,hwnd,NULL ,hinst,NULL
					);
					SendMessageA( hHide[i], WM_SETFONT, (WPARAM)hFont, 0 );
					SendMessageA( hExe[i], WM_SETFONT, (WPARAM)hFont, 0 );
					SendMessageA( hArg[i], WM_SETFONT, (WPARAM)hFont, 0 );
					if( br[i].hide ) SendMessageA( hHide[i], BM_SETCHECK, BST_CHECKED, 0 );
				}
				// 既定ブラウザEXEパスは編集不可
				SendMessage( hExe[BI_IE], EM_SETREADONLY, TRUE, 0 );
				SendMessage( hExe[BI_CHROME], EM_SETREADONLY, TRUE, 0 );
				SendMessage( hExe[BI_FIREFOX], EM_SETREADONLY, TRUE, 0 );
				SendMessage( hExe[BI_OPERA], EM_SETREADONLY, TRUE, 0 );
				// 参照ボタンアイコン
				SendMessageA( hFOpen, BM_SETIMAGE, IMAGE_ICON, (LPARAM)LoadImageA(hinst,"OPEN",IMAGE_ICON,16,16,0) );
				BrowserInfoFree(br), br=NULL;
			}
			SendMessageA( hTabc, TCM_SETIMAGELIST, (WPARAM)0, (LPARAM)hImage );
			// OK・キャンセルボタン
			hOK = CreateWindowW(
						L"button",L" O K "
						,WS_CHILD |WS_VISIBLE |WS_TABSTOP
						,0,0,0,0
						,hwnd,(HMENU)ID_DLG_OK
						,hinst,NULL
			);
			hCancel = CreateWindowW(
						L"button",L"ｷｬﾝｾﾙ"
						,WS_CHILD |WS_VISIBLE |WS_TABSTOP
						,0,0,0,0
						,hwnd,(HMENU)ID_DLG_CANCEL
						,hinst,NULL
			);
			SendMessageA( hOK, WM_SETFONT, (WPARAM)hFont, 0 );
			SendMessageA( hCancel, WM_SETFONT, (WPARAM)hFont, 0 );
			// ドラッグ＆ドロップ可
			DragAcceptFiles( hwnd, TRUE );
		}
		break;

	case WM_SIZE:
		{
			RECT rc = { 0, 0, LOWORD(lp), HIWORD(lp) };	// same as GetClientRect( hwnd, &rc );
			UINT i;
			MoveWindow( hTabc, 0, 0, LOWORD(lp), HIWORD(lp), TRUE );
			// タブを除いた表示領域を取得(rc.topがタブの高さになる)
			TabCtrl_AdjustRect( hTabc, FALSE, &rc );
			// パーツ移動
			MoveWindow( hTxtListenPort,	40,  rc.top+30+3,  110, 22, TRUE );
			MoveWindow( hListenPort,	160, rc.top+30,    80, 22, TRUE );
			MoveWindow( hTxtBtn,		40,  rc.top+26,    70, 22, TRUE );
			MoveWindow( hTxtExe,		20,  rc.top+60+3,  90, 22, TRUE );
			MoveWindow( hTxtArg,		50,  rc.top+100+3, 60, 22, TRUE );
			for( i=0; i<BI_USER1; i++ ){
				MoveWindow( hHide[i],	100, rc.top+24,  LOWORD(lp)-120, 22, TRUE );
				MoveWindow( hExe[i],	100, rc.top+60,  LOWORD(lp)-120, 22, TRUE );
				MoveWindow( hArg[i],	100, rc.top+100, LOWORD(lp)-120, 22, TRUE );
			}
			for( i=BI_USER1; i<BI_COUNT; i++ ){
				MoveWindow( hHide[i],	100, rc.top+24,  LOWORD(lp)-120,    22, TRUE );
				MoveWindow( hExe[i],	100, rc.top+60,  LOWORD(lp)-120-24, 22, TRUE );
				MoveWindow( hArg[i],	100, rc.top+100, LOWORD(lp)-120,    22, TRUE );
			}
			MoveWindow( hFOpen,			LOWORD(lp)-44,  rc.top+60-1,   24, 24, TRUE );
			MoveWindow( hOK,			LOWORD(lp)-200, HIWORD(lp)-50, 80, 30, TRUE );
			MoveWindow( hCancel,		LOWORD(lp)-100, HIWORD(lp)-50, 80, 30, TRUE );
		}
		return 0;

	case WM_NOTIFY:
		if( ((NMHDR*)lp)->code==TCN_SELCHANGE ){
			// 選択タブ識別ID(lParam)取得(※タブインデックスではない)
			TCITEM item;
			item.mask = TCIF_PARAM;
			TabCtrl_GetItem( hTabc, TabCtrl_GetCurSel(hTabc), &item );
			SendMessage( hwnd, WM_TABSELECT, item.lParam, 0 );
		}
		return 0;

	case WM_TABSELECT:
		{
			// wParamにタブIDが入っている（※タブインデックスではない）
			int tabindex = TabCtrl_GetSelHasLParam( hTabc, (int)wp );
			UINT i;
			TabCtrl_SetCurSel( hTabc, tabindex );
			TabCtrl_SetCurFocus( hTabc, tabindex );
			// いったん全部隠して
			ShowWindow( hTxtListenPort, SW_HIDE );
			ShowWindow( hTxtBtn, SW_HIDE );
			ShowWindow( hTxtExe, SW_HIDE );
			ShowWindow( hTxtArg, SW_HIDE );
			ShowWindow( hListenPort, SW_HIDE );
			ShowWindow( hFOpen, SW_HIDE );
			for( i=0; i<BI_COUNT; i++ ){
				ShowWindow( hHide[i], SW_HIDE );
				ShowWindow( hExe[i], SW_HIDE );
				ShowWindow( hArg[i], SW_HIDE );
			}
			// 該当タブのものだけ表示
			switch( (int)wp ){
			case 0: // HTTPサーバ
				ShowWindow( hTxtListenPort, SW_SHOW );
				ShowWindow( hListenPort, SW_SHOW );
				break;
			case 5: case 6: case 7: case 8:
				ShowWindow( hFOpen, SW_SHOW );	// ファイル選択ボタンはユーザ指定ブラウザのみ
			case 1: case 2: case 3: case 4:
				ShowWindow( hTxtBtn, SW_SHOW );
				ShowWindow( hTxtExe, SW_SHOW );
				ShowWindow( hTxtArg, SW_SHOW );
				// タブID-1がBrowserインデックスと対応している(TODO:わかりにくい)
				ShowWindow( hHide[wp-1], SW_SHOW );
				ShowWindow( hExe[wp-1], SW_SHOW );
				ShowWindow( hArg[wp-1], SW_SHOW );
				break;
			}
		}
		return 0;

	case WM_COMMAND:
		switch( LOWORD(wp) ){
		case ID_DLG_OK:
			{
				// 設定ファイル保存
				WCHAR	wPort[8], *wExe[BI_COUNT], *wArg[BI_COUNT];
				BOOL	hide[BI_COUNT];
				int		iPort;
				UINT	i;
				GetWindowTextW( hListenPort, wPort, sizeof(wPort)/sizeof(WCHAR) );
				iPort = _wtoi(wPort);
				if( iPort<=0 || iPort >65535 ){
					ErrorBoxW(L"そのポート番号はおかしい");
					return 0;
				}
				for( i=0; i<BI_COUNT; i++ ){
					wExe[i] = WindowTextAllocW( hExe[i] );
					wArg[i] = WindowTextAllocW( hArg[i] );
					hide[i] = (BST_CHECKED==SendMessage( hHide[i], BM_GETCHECK, 0,0 ))? TRUE:FALSE;
				}
				ConfigSave( wPort, wExe, wArg, hide );
				for( i=0; i<BI_COUNT; i++ ){
					if( wExe[i] ) free( wExe[i] );
					if( wArg[i] ) free( wArg[i] );
				}
				*lpRes = ID_DLG_OK;
				DestroyWindow( hwnd );
			}
			break;
		case ID_DLG_CANCEL:
			*lpRes = ID_DLG_CANCEL;
			DestroyWindow( hwnd );
			break;
		case ID_DLG_FOPEN:
			{
				// ユーザ指定ブラウザ実行ファイルをファイル選択ダイアログで入力
				WCHAR wpath[MAX_PATH+1] = L"";
				OPENFILENAMEW ofn;
				memset( &ofn, 0, sizeof(ofn) );
				ofn.lStructSize = sizeof(ofn);
				ofn.hwndOwner = hwnd;
				ofn.lpstrFile = wpath;
				ofn.nMaxFile = sizeof(wpath)/sizeof(WCHAR);
				if( GetOpenFileNameW( &ofn ) ){
					// 選択タブ識別ID(lParam)取得(※タブインデックスではない)
					TCITEM item;
					item.mask = TCIF_PARAM;
					TabCtrl_GetItem( hTabc, TabCtrl_GetCurSel(hTabc), &item );
					// タブID-1がBrowserインデックスと対応している(TODO:わかりにくい)
					SetWindowTextW( hExe[item.lParam-1], wpath );
				}
			}
			break;
		}
		return 0;

	case WM_DROPFILES:
		{
			// ドロップした場所がユーザ指定ブラウザEXEパス用エディットコントール上なら
			// ファイルパスをEXEパスに反映する。その他のドロップ操作は無視。
			WCHAR dropfile0[MAX_PATH+1]=L"";
			POINT po;
			HWND poWnd;
			DragQueryFileW( (HDROP)wp, 0, dropfile0, MAX_PATH );// (先頭)ドロップファイル
			DragQueryPoint( (HDROP)wp, &po );					// ドロップ座標(クライアント座標系)
			DragFinish( (HDROP)wp );
			ClientToScreen( hwnd, &po );						// 座標をスクリーン座標系に
			poWnd = WindowFromPoint(po);
			if( poWnd==hExe[BI_USER1] ) SetWindowTextW( hExe[BI_USER1], dropfile0 );
			else if( poWnd==hExe[BI_USER2] ) SetWindowTextW( hExe[BI_USER2], dropfile0 );
			else if( poWnd==hExe[BI_USER3] ) SetWindowTextW( hExe[BI_USER3], dropfile0 );
			else if( poWnd==hExe[BI_USER4] ) SetWindowTextW( hExe[BI_USER4], dropfile0 );
		}
		return 0;

	case WM_DESTROY:
		{ UINT i; for(i=0;i<BI_COUNT;i++) DestroyIcon( hIcon[i] ); }
		ImageList_Destroy( hImage );
		DeleteObject( hFont );
		if( *lpRes==ID_DLG_UNKNOWN ) *lpRes=ID_DLG_DESTROY;
		break;
	}
	return DefDlgProc( hwnd, msg, wp, lp );
}
// 設定画面作成。引数は初期表示タブID(※タブインデックスではない)。
DWORD ConfigDialog( UINT tabid )
{
	DWORD dwRes=ID_DLG_UNKNOWN;
	// ダイアログウィンドウプロシージャに結果変数のアドレスを渡す
	if( ConfigDialogProc( NULL, (UINT)(&dwRes), 0, 0 )==0 ){
		// ダイアログウィンドウ作成
		HWND hwnd = CreateWindowW(
						CONFIGDIALOGNAME
						,APPNAME L" 設定"
						,WS_OVERLAPPED |WS_CAPTION |WS_THICKFRAME |WS_VISIBLE
						,GetSystemMetrics(SM_CXFULLSCREEN)/2 - 150
						,GetSystemMetrics(SM_CYFULLSCREEN)/2 - 75
						,480, 300
						,MainForm,NULL
						,GetModuleHandle(NULL),NULL
		);
		if( hwnd ){
			MSG msg;
			// メインフォーム無効
			EnableWindow( MainForm, FALSE );
			// 初期表示タブ
			PostMessage( hwnd, WM_TABSELECT, tabid, 0 );
			// ダイアログが結果を返すまでループ
			while( dwRes==ID_DLG_UNKNOWN && GetMessage(&msg,NULL,0,0)>0 ){
				if( !IsDialogMessage( hwnd, &msg ) ){
					TranslateMessage( &msg );
					DispatchMessage( &msg );
				}
			}
			// メインフォーム有効
			EnableWindow( MainForm, TRUE );
			// なぜか隠れてしまうので最前面にする
			SetForegroundWindow( MainForm );
			BringWindowToTop( MainForm );
			SetActiveWindow( MainForm );
			SetFocus( MainForm );
		}
	}
	return dwRes;
}
void BrowserIconDestroy( BrowserIcon br[BI_COUNT] )
{
	if( br ){
		UINT i;
		for( i=0; i<BI_COUNT; i++ ){
			if( br[i].hwnd ) DestroyWindow( br[i].hwnd );
			if( br[i].icon ) DestroyIcon( br[i].icon );
		}
		free( br );
	}
}
// ブラウザアイコンボタン作成
// ボタンにアイコンを表示する
// http://keicode.com/windows/ui03.php
// TODO:ツールヒントでnameを表示するとよいか？
BrowserIcon* BrowserIconCreate( void )
{
	BrowserIcon* ico = (BrowserIcon*)malloc( sizeof(BrowserIcon)*BI_COUNT );
	if( ico ){
		BrowserInfo* br;
		memset( ico, 0, sizeof(BrowserIcon)*BI_COUNT );

		br = BrowserInfoAlloc();
		if( br ){
			HINSTANCE hinst = GetModuleHandle(NULL);
			int left=0;
			UINT i;
			for( i=0; i<BI_COUNT; i++ ){
				if( !br[i].hide && (br[i].exe || (BI_USER1<=i && i<=BI_USER4)) ){
					ico[i].hwnd = CreateWindowA(
									"button"
									,""
									,WS_CHILD |WS_VISIBLE |BS_ICON |BS_FLAT |WS_TABSTOP
									,left, 0, BUTTON_WIDTH, BUTTON_WIDTH
									,MainForm
									,(HMENU)BrowserCommand(i)	// WM_COMMANDのLOWORD(wp)に入る数値
									,hinst
									,NULL
					);
					ico[i].icon = FileIconLoad( br[i].exe );
					if( ico[i].icon ){
						SendMessageA( ico[i].hwnd, BM_SETIMAGE, IMAGE_ICON, (LPARAM)ico[i].icon );
					}
					else if( br[i].exe ){
						// エラーアイコン
						SendMessageA( ico[i].hwnd, BM_SETIMAGE, IMAGE_ICON, (LPARAM)LoadIcon(NULL,IDI_ERROR) );
					}
					left += BUTTON_WIDTH;
				}
			}
			BrowserInfoFree(br), br=NULL;
		}
	}
	return ico;
}
// ブラウザボタンクリック
void BrowserIconClick( UINT ix )
{
	BOOL empty=FALSE, invalid=FALSE;
	BrowserInfo* br = BrowserInfoAlloc();
	if( br ){
		if( br[ix].exe ){
			WCHAR* exe = PathResolve( br[ix].exe );
			if( exe ){
				size_t cmdlen = wcslen(exe) + (br[ix].arg?wcslen(br[ix].arg):0) + 32;
				WCHAR* cmd = (WCHAR*)malloc( cmdlen * sizeof(WCHAR) );
				WCHAR* dir = wcsdup( exe );
				if( cmd && dir ){
					STARTUPINFOW si;
					PROCESS_INFORMATION pi;
					DWORD err=0;
					WCHAR* p;
					memset( &si, 0, sizeof(si) );
					memset( &pi, 0, sizeof(pi) );
					si.cb = sizeof(si);
					// コマンドライン全体
					_snwprintf(cmd,cmdlen,L"\"%s\" %s http://localhost:%s/",exe,br[ix].arg?br[ix].arg:L"",wListenPort);
					// EXEフォルダ
					p = wcsrchr( dir, L'\\' );
					if( p ) *p = L'\0';
					if( !CreateProcessW(
								NULL			// ここにexeパスを渡すと引数が無視されるなぜだ
								,cmd			// しょうがないのでここにコマンドライン全体を渡す
								,NULL, NULL
								,FALSE, 0
								,NULL			// 環境ブロック？
								,dir			// カレントディレクトリ
								,&si, &pi
						)
					) err = GetLastError();
					CloseHandle( pi.hThread );
					CloseHandle( pi.hProcess );
					if( err ){
						// CreateProcessはショートカット(.lnk)を実行できないのでShellExecuteを使う。
						// ただしShellExecuteはPF使用量が1.2MBくらい増えるので、CreateProcessエラー時のみ。
						p = wcsrchr(exe,L'.'); // 拡張子.lnk以外はエラーログ
						if( !p || wcsicmp(p,L".lnk") ) LogW(L"CreateProcess(%s)エラー%u",exe,err);
						// 引数
						_snwprintf(cmd,cmdlen,L"%s http://localhost:%s/",br[ix].arg?br[ix].arg:L"",wListenPort);
						err = (DWORD)ShellExecuteW( NULL, NULL, exe, cmd, dir, SW_SHOWNORMAL );
						if( err<=32 ){
							LogW(L"ShellExecute(%s)エラー%u",exe,err);
							ErrorBoxW(L"%s\r\nを実行できません",exe);
							invalid = TRUE;
						}
					}
				}
				else LogW(L"L%u:mallocエラー",__LINE__);
				if( dir ) free(dir), dir=NULL;
				if( cmd ) free(cmd), cmd=NULL;
				free( exe );
			}
			else{
				ErrorBoxW(L"%s\r\nは実行できません",br[ix].exe);
				invalid = TRUE;
			}
		}
		else empty = TRUE;
		BrowserInfoFree(br), br=NULL;
	}
	// ブラウザ未登録やファイルなしエラーの場合は設定画面を出す。
	// 設定画面タブIDはBrowserインデックス＋1と対応(TODO:わかりにくい)
	if( empty || invalid ){
		if( ConfigDialog(ix+1)==ID_DLG_OK ) PostMessage( MainForm, WM_SETTING_OK, 0,0 );
	}
}

void LogSave( void )
{
	LONG count = SendMessageA( ListBox, LB_GETCOUNT, 0,0 );
	if( count !=LB_ERR && count>0 ){
		WCHAR wpath[MAX_PATH+1] = L"";
		OPENFILENAMEW ofn;
		memset( &ofn, 0, sizeof(ofn) );
		ofn.lStructSize = sizeof(ofn);
		ofn.hwndOwner = MainForm;
		ofn.lpstrInitialDir = L".";
		ofn.lpstrFilter = L"UTF-8N (BOMなしUTF-8)\0*\0\0";
		ofn.lpstrFile = wpath;
		ofn.nMaxFile = sizeof(wpath)/sizeof(WCHAR);
		ofn.Flags = OFN_OVERWRITEPROMPT |OFN_PATHMUSTEXIST;
		if( GetSaveFileNameW( &ofn ) ){
			HANDLE hFile = CreateFileW( wpath, GENERIC_WRITE, 0
								,NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL
			);
			if( hFile !=INVALID_HANDLE_VALUE ){
				LONG i;
				for( i=0; i<count; i++ ){
					WCHAR wstr[ LOGMAX +1 ]=L"";
					u_char utf8[ LOGMAX *2 +1 ]="";
					DWORD bWrite=0;
					SendMessageW( ListBox, LB_GETTEXT, i, (LPARAM)wstr );
					WideCharToMultiByte(CP_UTF8,0, wstr,-1, utf8,LOGMAX *2 +1, NULL,NULL);
					if( WriteFile( hFile, utf8, strlen(utf8), &bWrite, NULL )==0 ||
						WriteFile( hFile, "\r\n", 2, &bWrite, NULL )==0 ){
						LogW(L"L%u:WiteFileエラー%u",__LINE__,GetLastError());
					}
				}
				CloseHandle( hFile );
				MessageBoxW( MainForm, L"保存しました。", L"情報", MB_ICONINFORMATION );
			}
			else LogW(L"L%u:CreateFile(%s)エラー",__LINE__,wpath);
		}
	}
}

void MainFormTimer1000( void )
{
	// ログキャッシュをListBoxに吐き出してメモリ解放。
	LONG cxMax=0;
	LogCache* lc;
	// 現在のキャッシュをローカルに取得してグローバル変数は空にする。
	// CS解放した後はスレッド(ログ関数)が止まらず動ける。
	EnterCriticalSection( &LogCacheCS );
	lc = LogCache0;
	LogCache0 = LogCacheN = NULL;
	LeaveCriticalSection( &LogCacheCS );
	// ListBoxに書き出してメモリ解放
	while( lc ){
		LogCache* next = lc->next;
		// 画面上の文字列長さ最長を覚えておく
		SIZE size;
		if( GetTextExtentPoint32W( ListBoxDC, lc->text, wcslen(lc->text), &size ) ){
			if( size.cx > cxMax ) cxMax = size.cx;
		}
		// 多発するので無視…
		//else SendMessageW( ListBox, LB_ADDSTRING, 0, (LPARAM)L"GetTextExtentPoint32エラー" );
		SendMessageW( ListBox, LB_ADDSTRING, 0, (LPARAM)lc->text );
		free( lc );
		lc = next;
	}
	// 水平スクロールバー制御処理。なんでこんな処理が自力なんだ…。
	if( cxMax > ListBoxWidth ){
		ListBoxWidth = cxMax;
		SendMessageA( ListBox, LB_SETHORIZONTALEXTENT, cxMax +20, 0 );	// +20 適当余白
	}
	// タイトルバー更新
	{
		WCHAR text[128]=L"";
		WCHAR mem[32]=L"";	// メモリ使用量文字列
		PROCESS_MEMORY_COUNTERS pmc;

		memset( &pmc, 0, sizeof(pmc) );
		if( GetProcessMemoryInfo( ThisProcess, &pmc, sizeof(pmc) ) )
			_snwprintf(mem,sizeof(mem)/sizeof(WCHAR),L" (PF %u KB)",pmc.PagefileUsage /1024);

		if( ListenSock==INVALID_SOCKET )
			_snwprintf(text,sizeof(text)/sizeof(WCHAR),L"%s - エラー%s",APPNAME,mem);
		else
			_snwprintf(text,sizeof(text)/sizeof(WCHAR),L"%s - http://localhost:%s/%s",APPNAME,wListenPort,mem);

		SetWindowTextW( MainForm, text );
	}
	// TODO:なぜか起動直後は3.5MBくらいの仮想メモリ使用量だが、使っていると10MBくらいになり
	// ログ消去すると7-8MBにはなるが、起動直後の状態には戻らないなんで？？増え続けるわけでは
	// なく7-8MBで落ち着くのでリークしてるわけではないと思うんだが…。起動直後のメモリ使用量
	// に戻す術はないのか？HeapCompact()実行してみたけど効果なさそう。
	{
		UINT i;
		for( i=0; i<CLIENT_MAX; i++ ) if( Client[i].sock !=INVALID_SOCKET ) break;
		if( i>=CLIENT_MAX ) HeapCompact( Heap, 0 );
	}
}

// アプリ起動時の(致命的ではない)初期化処理。ウィンドウ表示されているのでウイルス対策ソフトで
// Listenを止められてもアプリ起動したことがわかる(わざわざ独自メッセージにした理由はそれくらい)。
// スタック1KB以上使うので関数化。
void MainFormCreateAfter( void )
{
	u_char path[MAX_PATH+1];
	WCHAR wpath[MAX_PATH+1];
	// OpenSSL
	SSL_library_init();
	ssl_ctx = SSL_CTX_new( SSLv23_client_method() );	// SSLv2,SSLv3,TLSv1すべて利用
	if( !ssl_ctx ) LogW(L"SSL_CTX_newエラー");
	// mlang.dll
	// DLL読み込み脆弱性対策フルパスで指定する。
	// http://www.ipa.go.jp/about/press/20101111.html
	GetSystemDirectoryA( path, sizeof(path) );
	_snprintf(path,sizeof(path),"%s\\mlang.dll",path);
	if( !(mlang.dll			= LoadLibraryA(path))
		|| !(mlang.Convert	= (CONVERTINETSTRING)GetProcAddress(mlang.dll,"ConvertINetString"))
	){
		LogW(L"mlang.dll無効");
		if( mlang.dll ) FreeLibrary( mlang.dll );
		memset( &mlang, 0, sizeof(mlang) );
	}
	// 空ノードファイル作る。既存ファイル上書きしない。
	GetCurrentDirectoryW( sizeof(wpath)/sizeof(WCHAR), wpath );
	if( SetCurrentDirectoryW( DocumentRoot ) ){
		MoveFileA( "tree.json.empty", "tree.json" );
		SetCurrentDirectoryW( wpath );
	}
	// クライアント初期化
	{ UINT i; for( i=0; i<CLIENT_MAX; i++ ) ClientInit( &(Client[i]) ); }
}


LRESULT CALLBACK MainFormProc( HWND hwnd, UINT msg, WPARAM wp, LPARAM lp )
{
	static BrowserIcon* browser=NULL;
	static HFONT hFont=NULL;

	switch( msg ){
	case WM_CREATE:
		// 起動中止するレベルの致命的エラーを含む一次初期化
		MainForm = hwnd;
		InitCommonControls();
		// タスクトレイアイコン
		TrayIcon = LoadIconA( GetModuleHandle(NULL), "0" );
		if( !TrayIcon ) return -1;
		// タスクトレイ登録
		// TODO:システム起動時にエラーでないのにタスクトレイにアイコンが無い時がある
		if( !TrayIconNotify( hwnd, NIM_ADD ) ) return -1;
		// リストボックス
		ListBox = CreateWindowExW(
					WS_EX_CLIENTEDGE
					,L"listbox"
					,L""
					,WS_CHILD |WS_VISIBLE |WS_VSCROLL |WS_HSCROLL
					,0,0,0,0
					,hwnd
					,NULL
					,((LPCREATESTRUCT)lp)->hInstance
					,NULL
		);
		if( !ListBox ) return -1;
		hFont = CreateFontW(15,0,0,0,0,0,0,0,0,0,0,0,0,L"MS Gothic");
		if( !hFont ) return -1;
		SendMessageW( ListBox, WM_SETFONT, (WPARAM)hFont, 0 );
		// リストボックス横幅計算のためデバイスコンテキスト取得フォント関連付け
		ListBoxDC = GetDC( ListBox );
		if( !ListBoxDC ) return -1;
		SelectObject( ListBoxDC, hFont );
		// プロセスハンドル
		ThisProcess = OpenProcess( PROCESS_QUERY_INFORMATION, FALSE, GetCurrentProcessId() );
		if( !ThisProcess ) return -1;
		// 二次初期化
		PostMessage( hwnd, WM_CREATE_AFTER, 0, 0 );
		break;

	case WM_CREATE_AFTER:
		MainFormCreateAfter();
		// ブラウザ起動ボタン作成
		browser = BrowserIconCreate();
		// 待受開始
		for( ;; ){
			ListenPortGet();
			// listen成功でループ抜け
			if( ListenStart() ) break;
			ErrorBoxW(L"このポート番号は他で使われているかもしれません。");
			// listenエラー設定ダイアログ出す
			if( ConfigDialog(0)==ID_DLG_CANCEL ) break;
			// ダイアログOK、listenリトライ
		}
		// タイマー起動
		MainFormTimer1000();
		SetTimer( MainForm, TIMER1000, 1000, NULL );
		return 0;

	case WM_SIZE:
		// なぜか下に隙間ができる。Listboxの縦方向が1行単位でしか大きさが変わらないようだ。
		MoveWindow( ListBox, 0, BUTTON_WIDTH, LOWORD(lp), HIWORD(lp)-BUTTON_WIDTH, TRUE );
		break;

	case WM_SYSCOMMAND:
		switch( LOWORD(wp) ){
		case SC_MINIMIZE:	// 最小化
			// TODO:最前面の時はタスクトレイに収納し、そうでない時は最前面にする、うまく動かない。
			// クリックした瞬間に最前面ではなくなってしまうからかな？
			//if( IsWindowVisible(hwnd) && (GetWindowLong(hwnd,GWL_EXSTYLE) & WS_EX_TOPMOST) ){
			//if( IsWindowVisible(hwnd) && IsChild(hwnd,GetTopWindow(GetDesktopWindow())) ){
			if( IsWindowVisible(hwnd) && GetForegroundWindow()==hwnd ){
				// タスクトレイに収納
				ShowWindow( hwnd, SW_MINIMIZE );	// 最小化するとワーキングセットが減る
				ShowWindow( hwnd, SW_HIDE );		// 非表示
			}
			else{
				// 最前面に
				SetForegroundWindow( hwnd );
				BringWindowToTop( hwnd );
				SetActiveWindow( hwnd );
				SetFocus( hwnd );
			}
			return 0;
		case SC_CLOSE:		// 閉じる
			DestroyWindow( hwnd );
			return 0;
		}
		break;

	case WM_TRAYICON: // タスクトレイアイコンクリック
		switch( lp ){
		case WM_LBUTTONDOWN:
		case WM_RBUTTONDOWN:
			if( IsWindowVisible(hwnd) ){
				// TODO:最前面の時はタスクトレイに収納し、そうでない時は最前面にする、うまく動かない。
				// クリックした瞬間に最前面ではなくなってしまうからかな？
				//if( GetWindowLong(hwnd,GWL_EXSTYLE) & WS_EX_TOPMOST ){
				//if( IsChild(hwnd,GetTopWindow(GetDesktopWindow())) ){
				if( GetForegroundWindow()==hwnd ){
					// タスクトレイに収納
					ShowWindow( hwnd, SW_MINIMIZE );
					ShowWindow( hwnd, SW_HIDE );
				}
				else{
					// 最前面に
					SetForegroundWindow( hwnd );
					BringWindowToTop( hwnd );
					SetActiveWindow( hwnd );
					SetFocus( hwnd );
				}
			}
			else{
				// タスクトレイから復帰
				ShowWindow( hwnd, SW_SHOW );
				ShowWindow( hwnd, SW_RESTORE );
			}
		}
		return 0;

	case WM_CONTEXTMENU: // 右クリック
		{
			// ポップアップメニュー生成
			HMENU menu = CreatePopupMenu();
			AppendMenuW( menu, MF_STRING, CMD_LOGSAVE, L"ログ保存" );
			AppendMenuW( menu, MF_STRING, CMD_LOGCLEAR, L"ログ消去" );
			AppendMenuW( menu, MF_SEPARATOR, 0, L"" );
			AppendMenuW( menu, MF_STRING, CMD_SETTING, L"設定" );
			AppendMenuW( menu, MF_SEPARATOR, 0, L"" );
			AppendMenuW( menu, MF_STRING, CMD_EXIT, L"終了" );
			SetForegroundWindow( hwnd );
			TrackPopupMenu( menu, 0, LOWORD(lp), HIWORD(lp), 0, hwnd, NULL );
			PostMessage( hwnd, WM_NULL, 0, 0 );
			DestroyMenu( menu );
		}
		return 0;

	case WM_COMMAND:
		switch( LOWORD(wp) ){
		case CMD_EXIT:		// 終了
			DestroyWindow( hwnd );
			break;
		case CMD_LOGSAVE:	// ログ保存
			LogSave();
			break;
		case CMD_LOGCLEAR:	// ログ消去(メモリ解放になる)
			SendMessageA( ListBox, LB_RESETCONTENT, 0,0 );
			SendMessageA( ListBox, LB_SETHORIZONTALEXTENT, 0, 0 );
			ListBoxWidth = 0;
			break;
		case CMD_SETTING:	// 設定
			if( ConfigDialog(0)==ID_DLG_OK ) PostMessage( hwnd, WM_SETTING_OK, 0,0 );
			break;
		case CMD_IE     : BrowserIconClick( BI_IE );     break;
		case CMD_CHROME : BrowserIconClick( BI_CHROME ); break;
		case CMD_FIREFOX: BrowserIconClick( BI_FIREFOX );break;
		case CMD_OPERA  : BrowserIconClick( BI_OPERA );  break;
		case CMD_USER1	: BrowserIconClick( BI_USER1 ); break;
		case CMD_USER2	: BrowserIconClick( BI_USER2 ); break;
		case CMD_USER3	: BrowserIconClick( BI_USER3 ); break;
		case CMD_USER4	: BrowserIconClick( BI_USER4 ); break;
		}
		return 0;

	case WM_SETTING_OK: // 設定ダイアログOK
		{
			u_char oldPort[8];
			strcpy( oldPort, ListenPort );			// 現在ポート退避
			ListenPortGet();
			if( strcmp(oldPort,ListenPort) ){		// ポート番号変わった
				BOOL success;
				SocketShutdown();					// コネクション切断
				success = ListenStart();			// 待ち受け開始
				TrayIconNotify( hwnd, NIM_MODIFY );	// トレイアイコン
				MainFormTimer1000();				// タイトルバー
				// Listen失敗時は再び設定ダイアログ
				if( !success ) PostMessage( hwnd, WM_COMMAND, MAKEWPARAM(CMD_SETTING,0), 0 );
			}
			BrowserIconDestroy( browser );
			browser = BrowserIconCreate();
		}
		return 0;

	case WM_SOCKET: // ソケットイベント
		// wp = イベントが発生したソケット(SOCKET)
		// WSAGETSELECTEVENT(lp) = ソケットイベント番号(WORD)
		// WSAGETSELECTERROR(lp) = エラー番号(WORD)
		if( WSAGETSELECTERROR(lp) ) LogW(L"[%u]ソケットイベントエラー(%u)",(SOCKET)wp,WSAGETSELECTERROR(lp));
		switch( WSAGETSELECTEVENT(lp) ){
		//	http://members.jcom.home.ne.jp/toya.hiroshi/winsock2/index.html?wsaasyncselect_2.html
		//case FD_CONNECT: break; // connect成功した
		case FD_ACCEPT: SocketAccept( (SOCKET)wp );			break; // acceptできる
		case FD_READ  : SocketRead( (SOCKET)wp, browser );	break; // recvできる
		case FD_WRITE : SocketWrite( (SOCKET)wp );			break; // sendできる
		case FD_CLOSE : SocketClose( (SOCKET)wp );			break; // 接続は閉じられた
		default: LogW(L"[%u]不明なソケットイベント(%u)",(SOCKET)wp,WSAGETSELECTEVENT(lp));
		}
		return 0;

	case WM_TIMER:
		if( wp==TIMER1000 ) MainFormTimer1000();
		return 0;

	case WM_DESTROY:
		SocketShutdown();
		BrowserIconDestroy( browser );
		TrayIconNotify( hwnd, NIM_DELETE );
		if( mlang.dll ) FreeLibrary( mlang.dll ), memset(&mlang,0,sizeof(mlang));
		ReleaseDC( ListBox, ListBoxDC ), ListBoxDC=NULL;
		CloseHandle( ThisProcess ), ThisProcess=NULL;
		DeleteObject( hFont );
		MainForm = NULL;
		PostQuitMessage(0);
		return 0;
	}
	return DefDlgProc( hwnd, msg, wp, lp );
}

HWND Startup( HINSTANCE hinst, int nCmdShow )
{
	WSADATA	wsaData;
	HWND	hwnd;

	WSAStartup( MAKEWORD(2,2), &wsaData );
	InitializeCriticalSection( &LogCacheCS );
	Heap = GetProcessHeap();
	// ドキュメントルート(exeフォルダ\\root)
	{
		size_t length = 32;
		WCHAR* wpath = NULL;
		while( !wpath ){
			wpath = (WCHAR*)malloc( length *sizeof(WCHAR) );
			if( wpath ){
				DWORD len = GetModuleFileNameW( NULL, wpath, length );
				if( len && len < length-1 ){
					WCHAR* p = wcsrchr(wpath,L'\\');
					if( p ){
						wcscpy( p+1, L"root" );
						DocumentRootLen = wcslen( wpath );
						DocumentRoot = wpath;
						break;
					}
					else{
						ErrorBoxW(L"GetModuleFileName()=%s",wpath);
						free(wpath);
						return NULL;
					}
				}
				else{
					free(wpath);
					wpath = NULL;
					length += 32;
				}
			}
			else{
				ErrorBoxW(L"L%u:mallocエラー",__LINE__);
				return NULL;
			}
		}
	}
	// ウィンドウクラス登録
	{
		WNDCLASSEXW	wc;
		// メインフォーム用クラス
		memset( &wc, 0, sizeof(wc) );
		wc.cbSize        = sizeof(wc);
		wc.cbWndExtra	 = DLGWINDOWEXTRA;
		wc.lpfnWndProc   = MainFormProc;
		wc.hInstance     = hinst;
		wc.hIcon	     = LoadIconA( hinst, "0" );
		wc.hCursor	     = LoadCursor(NULL,IDC_ARROW);
		wc.hbrBackground = (HBRUSH)(COLOR_BTNFACE+1);
		wc.lpszClassName = MAINFORMNAME;
		RegisterClassExW(&wc);
		// 設定ダイアログ用クラス
		wc.lpfnWndProc   = ConfigDialogProc;
		wc.lpszClassName = CONFIGDIALOGNAME;
		RegisterClassExW( &wc );
	}
	// メインフォーム
	hwnd = CreateWindowW(
				MAINFORMNAME
				,APPNAME
				,WS_OVERLAPPEDWINDOW |WS_CLIPCHILDREN
				,CW_USEDEFAULT, CW_USEDEFAULT, 600, 400
				,NULL, NULL, hinst, NULL
	);
	if( hwnd ){
		ShowWindow( hwnd, nCmdShow );
		UpdateWindow( hwnd );
	}
	return hwnd;
}
void Cleanup( void )
{
	LogCache* lc = LogCache0;
	while( lc ){
		LogCache* next = lc->next;
		free( lc );
		lc = next;
	}
	free( DocumentRoot );
	DeleteCriticalSection( &LogCacheCS );
	WSACleanup();
#ifdef MEMLOG
	if( mlog ) fclose(mlog);
#endif
}
//
//	WinMain - Application entry point
//
int WINAPI wWinMain( HINSTANCE hinst, HINSTANCE hinstPrev, LPWSTR lpCmdLine, int nCmdShow )
{
	MSG msg = {0};

	if( Startup( hinst, nCmdShow ) ){
		while( GetMessage( &msg, NULL, 0, 0 ) >0 ){
			if( !IsDialogMessage( MainForm, &msg ) ){
				TranslateMessage( &msg );
				DispatchMessage( &msg );
			}
		}
	}
	Cleanup();
	return (int)msg.wParam;
}
