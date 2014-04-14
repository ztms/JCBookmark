// vim:set ts=4:vim modeline
//
//	JCBookmark専用HTTPサーバ
//
//	ファイル文字コード:UTF-8 (じゃないとブラウザで文字化け) BOM付 (じゃないとVCエラー)
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
//	TODO:UPnPポート開放
//	TODO:しばしばソケットエラー10053(WSAECONNABORTED)が発生するが、ソケット切断が早すぎた感じで特に動作上は
//	問題ない場合も多い。が、Win7+IE11環境でものすごく不安定でブラウザ側にデータ届かない症状が深刻化する事が
//	ある。その場合も10053が多発はしている。どうもリクエスト受信せずに切断になってしまうコネクションがあるよ
//	うだ。なぜかSSLなら発生せず非SSLで頻発する。自分PCのVirtualBoxのWin7+IE11なら特に問題ない。ウイルス対策
//	ソフトの影響、無線LANの影響、ネット回線の影響とか・・？
//	TODO:Operaブックマーク読み込みはBookSyncのソースが参考にならないかな・・？
//	TODO:Webサイトの「Facebookアカウントでログイン」「Twitterアカウントでログイン」を実装できる？
//	OAuth認証という技術？仕組み？らしい。
//	WebアプリにSNSアカウントでのログインを実装する
//	http://codezine.jp/article/detail/6572
//	OAuth認証でFacebookを利用するWebアプリケーション（PHPの場合）
//	http://blog.unfindable.net/archives/1891
//	第1回 「OAuth」の基本動作を知る
//	http://www.atmarkit.co.jp/fsecurity/rensai/digid01/02.html
//	[iPhoneプログラミング][OAuth]TwitterのOAuth認証を使う
//	http://d.hatena.ne.jp/nakamura001/20100519/1274287901
//	twitterでOAuthを使う方法（その１：認証まで）
//	http://sayama-yuki.cocolog-nifty.com/blog/2009/09/twitteroauth-d7.html
//	OAuthプロトコルには1.0と2.0があってWebサービス毎に異なったりややこしいが、さらに似たような
//	シングルサインオン関連で「OpenID」「SAML」とかあるようだ。う～んいろいろあるのな・・。
//	http://www.sakimura.org/2011/05/1087/
//	http://www.hde.co.jp/press/column/detail.php?n=201010290
//	http://dev.ariel-networks.com/wp/archives/258
//	http://d.hatena.ne.jp/tk_4dd/20120128
//	TODO:ログインパスワードにWindowsログインユーザのパスワードを使えるか？
//	LogonUser()とかGetUserName()とかあるけどWindowsの仕組みが面倒くさそう。NTLM認証ってなに？
//	TODO:アプリ実行時のWindowsの警告を解除する手順（ブロックを解除する）をWebのFAQにでも載せる。
//	http://itpro.nikkeibp.co.jp/article/Windows/20051215/226271/
//	http://pc.nikkeibp.co.jp/article/knowhow/20080820/1007172/?f=pcmac&rt=nocnt
//	http://attosoft.info/blog/item-nozoneinfo/
//	TODO:Windows2000対応
//	GetNameInfoW が XP (SP2?) 以降のAPIらしいが、Win2000でもANSI版のgetnameinfoなら使えるらしい。
//	http://msdn.microsoft.com/en-us/library/windows/desktop/ms738532(v=vs.85).aspx
//	ws2tcpip.h に加えて wspiapi.h を include すればよいと。たしかに起動時エラーは出なくなったけど、
//	Unicode⇔ANSI変換が増えてごちゃごちゃするなぁ・・。でもこんどは FreeAddrInfoW でエラーになった。
//	なるほどUnicode版の関数がないのか。まだ他にもあるのか？不明。うーむ・・対応できるけど、Windows2000
//	で動く必要があるか？ブラウザ画面が使いたいだけならHTTPサーバは別マシンで起動しておけばよいので、
//	なんとかそれでおねがいしたい・・。ブラウザ画面は2000のOpera10.63で確認。ただし日本語表示は未確認。
//	GetNameInfoW は WSAAddressToStringW が同機能だったけど、ポート番号付き文字列になってしまうようで
//	単純置き換えではダメだった。
//	TODO:Chromeみたいな自動バージョンアップ機能をつけるには？旧exeと新exeがあってどうやって入れ替えるの？
//	TODO:WinHTTPつかえばOpenSSLいらない？
//	TODO:strlenのコスト削減でこんな構造体を使うとよいのか…？
//	[C言語で文字列を簡単にかつ少し高速に操作する]
//	http://d.hatena.ne.jp/htz/20090222/1235322977
//	TODO:ログがいっぱい出るとListBoxのメモリ使用量が気になるのでログレベルの設定を作るべきか。
//	「ログなし」「普通」「大量」
//	TODO:スタック使用量が気になる・・
//	http://yabooo.org/archives/65
//	http://okwave.jp/qa/q1099230.html
//	http://technet.microsoft.com/ja-jp/windows/mark_04.aspx
//	TODO:ログの検索、ListBoxは完全一致か前方一致検索しかできない？(LB_FINDSTRING/LB_FINDSTRINGEXACT)
//	全部LB_GETTEXTして自力検索すればいいか。でも一致部分だけ反転表示とかできないとショボいし…。
//	TODO:ログ文字列を選択コピーできるようにする簡単な手はないものか…
//	EDITコントロール(含むリッチエディット)はプログラムから行追加とかできないようだし…
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
#pragma comment(lib,"iphlpapi.lib")
#pragma comment(lib,"libeay32.lib")
#pragma comment(lib,"ssleay32.lib")
// 非ユニコード(Lなし)文字列リテラルをUTF-8でexeに格納する#pragma。
// KB980263を適用しないと有効にならない。Expressには正式リリースされていない
// hotfixにも見えるが、ググって非公式サイトからexeダウンロードして適用したら
// 期待通り動作した。いいのかなダメかな・・。
#pragma execution_character_set("utf-8")
// うざいC4996警告無視
#pragma warning(disable:4996)
// タスクトレイアイコンのバルーンチップが、_WIN32_WINNT=0x0600(既定)だと出ない。
// なぜ？上位互換ではないの？0x0500台に定義すれば出るが、0x0500や0x0501だと関数
// 未定義エラーが発生する。0x0502ならバルーン出たので採用。
#define _WIN32_WINNT 0x0502

#include <winsock2.h>
#include <ws2tcpip.h>
#include <wininet.h>
#include <iphlpapi.h>
#include <process.h>
#include <mmsystem.h>
#include <commctrl.h>
#include <shellapi.h>
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
#define		WM_TRAYICON_ADD		(WM_APP+2)		// タスクトレイアイコン登録用メッセージ
#define		WM_CREATE_AFTER		(WM_APP+3)		// WM_CREATE後に1回実行するメッセージ
#define		WM_CONFIG_DIALOG	(WM_APP+4)		// 設定ダイアログ後処理
#define		WM_TABSELECT		(WM_APP+5)		// 設定ダイアログ初期表示タブのためのメッセージ
#define		WM_THREADFIN		(WM_APP+6)		// スレッド終了メッセージ
#define		APPNAME				L"JCBookmark v2.1dev"

HWND		MainForm			= NULL;				// メインフォームハンドル
HWND		ListBox				= NULL;				// リストボックスハンドル
HDC			ListBoxDC			= NULL;				// リストボックスデバイスコンテキスト
LONG		ListBoxWidth		= 0;				// リストボックス横幅
#define		TIMER1000			1					// 1秒間隔タイマーID
#define		TIMER_BALOON		2					// タスクトレイバルーン消去タイマーID
HANDLE		ThisProcess			= NULL;				// 自プロセスハンドル
SSL_CTX*	ssl_ctx				= NULL;				// SSLコンテキスト


// WM_COMMANDのLOWORD(wp)に入るID
#define CMD_EXIT		1		// ポップアップメニュー終了
#define CMD_SETTING		2		// ポップアップメニュー設定
#define CMD_LOGSAVE		3		// ポップアップメニューログ保存
#define CMD_LOGCLEAR	4		// ポップアップメニューログ消去
#define CMD_ABOUT		5		// ポップアップメニューバージョン情報
#define CMD_IE			10		// IEボタン
#define CMD_CHROME		11		// Chromeボタン
#define CMD_FIREFOX		12		// Firefoxボタン
#define CMD_OPERA		13		// Operaボタン
#define CMD_USER1		14		// ユーザ指定ブラウザ1
#define CMD_USER2		15		// ユーザ指定ブラウザ2
#define CMD_USER3		16		// ユーザ指定ブラウザ3
#define CMD_USER4		17		// ユーザ指定ブラウザ4










//---------------------------------------------------------------------------------------------------------------
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
#define MEMLOG
#ifdef MEMLOG
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
void* malloc_( size_t size, UINT line )
{
	void* p = malloc( size );
	if( !mlog ) mlogopen();
	if( mlog && p ) fprintf(mlog,"+%p:L%u:malloc(%u) (%ukb)\r\n",p,line,size,PF());
	return p;
}
void free_( void* p, UINT line )
{
	free( p );
	if( !mlog ) mlogopen();
	if( mlog ) fprintf(mlog,"-%p:L%u (%ukb)\r\n",p,line,PF());
}
char* strdup_( LPCSTR str, UINT line )
{
	size_t size = strlen(str)+1;
	char* p = malloc_( size, line );
	if( p ) memcpy( p, str, size );
	return p;
}
WCHAR* wcsdup_( LPCWSTR wstr, UINT line )
{
	size_t size = (wcslen(wstr)+1)*sizeof(WCHAR);
	WCHAR* p = malloc_( size, line );
	if( p ) memcpy( p, wstr, size );
	return p;
}
FILE* fopen_( LPCSTR path, LPCSTR mode, UINT line )
{
	FILE* fp = fopen( path, mode );
	if( !mlog ) mlogopen();
	if( mlog && fp ) fprintf(mlog,"+%p:L%u:fopen(%s) (%ukb)\r\n",fp,line,path,PF());
	return fp;
}
FILE* wfopen_( LPCWSTR path, const WCHAR* mode, UINT line )
{
	FILE* fp = _wfopen( path, mode );
	if( !mlog ) mlogopen();
	if( mlog && fp ) fprintf(mlog,"+%p:L%u:_wfopen(?) (%ukb)\r\n",fp,line,PF());
	return fp;
}
int fclose_( FILE* fp, UINT line )
{
	if( !mlog ) mlogopen();
	if( mlog ) fprintf(mlog,"-%p:L%u (%ukb)\r\n",fp,line,PF());
	return fclose( fp );
}
HANDLE CreateFileW_( LPCWSTR path, DWORD access, DWORD mode, LPSECURITY_ATTRIBUTES sec, DWORD disp, DWORD attr, HANDLE templete, UINT line )
{
	HANDLE handle = CreateFileW( path, access, mode, sec, disp, attr, templete );
	if( !mlog ) mlogopen();
	if( mlog && handle!=INVALID_HANDLE_VALUE )
		fprintf(mlog,"+%p:L%u:CreateFileW(?) (%ukb)\r\n",handle,line,PF());
	return handle;
}
BOOL CloseHandle_( HANDLE handle, UINT line )
{
	if( !mlog ) mlogopen();
	if( mlog ) fprintf(mlog,"-%p:L%u (%ukb)\r\n",handle,line,PF());
	return CloseHandle( handle );
}
UINT ExtractIconExW_( LPCWSTR path, int index, HICON* iconL, HICON* iconS, UINT n, UINT line )
{
	UINT ret = ExtractIconExW( path, index, iconL, iconS, n );
	if( !mlog ) mlogopen();
	if( mlog && ret ){
		if( iconL && *iconL ) fprintf(mlog,"+%p:L%u:ExtractIconExW(?) (%ukb)\r\n",*iconL,line,PF());
		if( iconS && *iconS ) fprintf(mlog,"+%p:L%u:ExtractIconExW(?) (%ukb)\r\n",*iconS,line,PF());
	}
	return ret;
}
HICON ExtractAssociatedIconW_( HINSTANCE hinst, LPWSTR path, LPWORD index, UINT line )
{
	HICON icon = ExtractAssociatedIconW( hinst, path, index );
	if( !mlog ) mlogopen();
	if( mlog && icon ) fprintf(mlog,"+%p:L%u:ExtractAssociatedIconW(?) (%ukb)\r\n",icon,line,PF());
	return icon;
}
DWORD_PTR SHGetFileInfoW_( LPCWSTR path, DWORD attr, SHFILEINFOW* info, UINT byte, UINT flag, UINT line )
{
	DWORD_PTR ret = SHGetFileInfoW( path, attr, info, byte, flag );
	if( !mlog ) mlogopen();
	if( mlog && ret && info && info->hIcon )
		fprintf(mlog,"+%p:L%u:SHGetFileInfoW(?) (%ukb)\r\n",info->hIcon,line,PF());
	return ret;
}
BOOL DestroyIcon_( HICON icon, UINT line )
{
	if( !mlog ) mlogopen();
	if( mlog ) fprintf(mlog,"-%p:L%u (%ukb)\r\n",icon,line,PF());
	return DestroyIcon( icon );
}
SOCKET WSAAPI socket_( int af, int type, int proto, UINT line )
{
	SOCKET sock = socket( af, type, proto );
	if( !mlog ) mlogopen();
	if( mlog && sock!=INVALID_SOCKET ) fprintf(mlog,"+SOCK%u:L%u:socket() (%ukb)\r\n",sock,line,PF());
	return sock;
}
SOCKET accept_( SOCKET lsock, struct sockaddr* addr, int* addrlen, UINT line )
{
	SOCKET sock = accept( lsock, addr, addrlen );
	if( !mlog ) mlogopen();
	if( mlog && sock!=INVALID_SOCKET ) fprintf(mlog,"+SOCK%u:L%u:accept() (%ukb)\r\n",sock,line,PF());
	return sock;
}
int closesocket_( SOCKET sock, UINT line )
{
	if( !mlog ) mlogopen();
	if( mlog ) fprintf(mlog,"-SOCK%u:L%u (%ukb)\r\n",sock,line,PF());
	return closesocket( sock );
}
#define malloc(a)						malloc_(a,__LINE__)
#define strdup(a)						strdup_(a,__LINE__)
#define wcsdup(a)						wcsdup_(a,__LINE__)
#define free(a)							free_(a,__LINE__)
#define fopen(a,b)						fopen_(a,b,__LINE__)
#define _wfopen(a,b)					wfopen_(a,b,__LINE__)
#define fclose(a)						fclose_(a,__LINE__)
#define CreateFileW(a,b,c,d,e,f,g)		CreateFileW_(a,b,c,d,e,f,g,__LINE__)
#define CloseHandle(a)					CloseHandle_(a,__LINE__)
#define ExtractIconExW(a,b,c,d,e)		ExtractIconExW_(a,b,c,d,e,__LINE__)
#define ExtractAssociatedIconW(a,b,c)	ExtractAssociatedIconW_(a,b,c,__LINE__)
#define SHGetFileInfoW(a,b,c,d,e)		SHGetFileInfoW_(a,b,c,d,e,__LINE__)
#define DestroyIcon(a)					DestroyIcon_(a,__LINE__)
#define socket(a,b,c)					socket_(a,b,c,__LINE__)
#define accept(a,b,c)					accept_(a,b,c,__LINE__)
#define closesocket(a)					closesocket_(a,__LINE__)
#endif // MEMLOG











//---------------------------------------------------------------------------------------------------------------
// 共通
//
void ErrorBoxA( const UCHAR* fmt, ... )
{
	UCHAR msg[256];
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
#define isCRLF(c) ((c)=='\r' || (c)=='\n')
#define isCRLFW(c) ((c)==L'\r' || (c)==L'\n')
void CRLFtoSPACE( UCHAR* s )
{
	if( s ) for( ; *s; s++ ) if( isCRLF(*s) ) *s=' ';
}
void CRLFtoSPACEW( WCHAR* s )
{
	if( s ) for( ; *s; s++ ) if( isCRLFW(*s) ) *s=L' ';
}
UCHAR* chomp( UCHAR* s )
{
	if( s ){
		UCHAR* p;
		for( p=s; *p; p++ ){
			if( isCRLF(*p) ){
				*p = '\0';
				break;
			}
		}
	}
	return s;
}









//---------------------------------------------------------------------------------------------------------------
// サーバログ。一旦メモリに溜めておき、1秒毎のWM_TIMERでListBoxにSendMessageする。
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
	size_t bytes = len * sizeof(WCHAR);
	LogCache* lc = malloc( sizeof(LogCache) + bytes );
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
	else ErrorBoxW(L"L%u:malloc(%u)エラー",__LINE__,sizeof(LogCache)+bytes);
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
void LogA( const UCHAR* fmt, ... )
{
	UCHAR		msg[LOGMAX]="";
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

UCHAR* WideCharToUTF8alloc( const WCHAR* wstr )
{
	if( wstr ){
		int bytes = WideCharToMultiByte(CP_UTF8, 0, wstr, -1, NULL, 0, NULL, NULL);
		UCHAR* utf8 = malloc( bytes );
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
WCHAR* MultiByteToWideCharAlloc( const UCHAR* utf8, UINT cp )
{
	if( utf8 ){
		int count = MultiByteToWideChar( cp, 0, utf8, -1, NULL, 0 );
		WCHAR* wstr = malloc( (count+1) * sizeof(WCHAR) );
		if( wstr ){
			if( MultiByteToWideChar( cp, 0, utf8, -1, wstr, count ) !=0 ){
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
// 文字列連結
// 実装が面倒なので可変引数は使わない。
UCHAR* strjoin( const UCHAR* s1 ,const UCHAR* s2 ,const UCHAR* s3 ,const UCHAR* s4 ,const UCHAR* s5 )
{
	if( s1 && s2 ){
		size_t len1 = strlen( s1 );
		size_t len2 = strlen( s2 );
		size_t len3 = s3? strlen( s3 ) : 0;
		size_t len4 = s4? strlen( s4 ) : 0;
		size_t len5 = s5? strlen( s5 ) : 0;
		UCHAR* ss = malloc( len1 +len2 +len3 +len4 +len5 +1 );
		if( ss ){
			memcpy( ss, s1, len1 );
			memcpy( ss +len1, s2, len2 );
			if( len3 ) memcpy( ss +len1 +len2, s3, len3 );
			if( len4 ) memcpy( ss +len1 +len2 +len3, s4, len4 );
			if( len5 ) memcpy( ss +len1 +len2 +len3 +len4, s5, len5 );
			ss[len1+len2+len3+len4+len5] = '\0';
			return ss;
		}
		else LogW(L"L%u:malloc(%u)エラー",__LINE__,len1+len2+len3+len4+len5+1);
	}
	return NULL;
}
WCHAR* wcsjoin( const WCHAR* s1, const WCHAR* s2, const WCHAR* s3, const WCHAR* s4, const WCHAR* s5 )
{
	if( s1 && s2 ){
		size_t len1 = wcslen( s1 );
		size_t len2 = wcslen( s2 );
		size_t len3 = s3? wcslen( s3 ) : 0;
		size_t len4 = s4? wcslen( s4 ) : 0;
		size_t len5 = s5? wcslen( s5 ) : 0;
		WCHAR* ss = malloc( (len1 +len2 +len3 +len4 +len5 +1) *sizeof(WCHAR) );
		if( ss ){
			memcpy( ss, s1, len1 *sizeof(WCHAR) );
			memcpy( ss +len1, s2, len2 *sizeof(WCHAR) );
			if( len3 ) memcpy( ss +len1 +len2, s3, len3 *sizeof(WCHAR) );
			if( len4 ) memcpy( ss +len1 +len2 +len3, s4, len4 *sizeof(WCHAR) );
			if( len5 ) memcpy( ss +len1 +len2 +len3 +len4, s5, len5 *sizeof(WCHAR) );
			ss[len1+len2+len3+len4+len5] = L'\0';
			return ss;
		}
		else LogW(L"L%u:malloc(%u)エラー",__LINE__,(len1+len2+len3+len4+len5+1)*sizeof(WCHAR));
	}
	return NULL;
}
// 文字数指定strdup
// srcがnより短い場合は実行してはいけない
UCHAR* strndup( const UCHAR* src, int n )
{
	if( src && n>0 ){
		UCHAR* dup = malloc( n + 1 );
		if( dup ){
			memcpy( dup, src, n );
			dup[n] = '\0';
			return dup;
		}
		else LogW(L"L%u:malloc(%u)エラー",__LINE__,n+1);
	}
	return NULL;
}
// 文字数指定wcsdup
// srcがnより短い場合は実行してはいけない
WCHAR* wcsndup( const WCHAR* src, int n )
{
	if( src && n>0 ){
		WCHAR* dup = malloc( (n + 1) * sizeof(WCHAR) );
		if( dup ){
			memcpy( dup, src, n * sizeof(WCHAR) );
			dup[n] = L'\0';
			return dup;
		}
		else LogW(L"L%u:malloc(%u)エラー",__LINE__,(n+1)*sizeof(WCHAR));
	}
	return NULL;
}
// " と \ をエスケープしてstrndup
// srcがnより短い場合は実行してはいけない。
// UTF-8なら2バイト目以降にASCII文字は出てこない(らしい)ので多バイト文字識別不要。
UCHAR* strndupJSON( const UCHAR* src, int n )
{
	if( src && n>0 ){
		UCHAR* dup = malloc( n * 2 + 1 );
		if( dup ){
			UCHAR* dst = dup;
			int i;
			for( i=n; i>0; i-- ){
				if( *src=='\t' ){
					// http://cakephp.org/の<title>にTAB文字(0x09)が含まれており、Chrome/Firefoxで
					// なぜかJSONパースできず$.ajax()がエラーになるようで、仕方なく \t に変換する。
					// IE8は動いてくれるのだが。JSONって値にTAB文字ダメな仕様なの？
					*src++ ,*dst++ ='\\' ,*dst++ ='t';
					continue;
				}
				if( *src=='"' || *src=='\\' ) *dst++ = '\\';
				*dst++ = *src++;
			}
			*dst = '\0';
			return dup;
		}
		else LogW(L"L%u:malloc(%u)エラー",__LINE__,n*2+1);
	}
	return NULL;
}
// 大小文字区別しないstrstr()
UCHAR* stristr( const UCHAR* buf, const UCHAR* word )
{
	if( buf && word ){
		size_t len = strlen( word );
		for( ; *buf; buf++ ) if( strnicmp( buf, word, len )==0 ) return buf;
	}
	return NULL;
}
UCHAR* stristrL( const UCHAR* buf, const UCHAR* word, const UCHAR* limit )
{
	if( buf && word ){
		size_t len = strlen( word );
		while( buf < limit && *buf ){
			if( strnicmp( buf, word, len )==0 ) return buf;
			buf++;
		}
	}
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
// IEお気に入り(.url)ファイルURL文字列複製(JSON出力用)
// - 改行文字以降を削除
// - 先頭の連続するダブルクォート文字をスキップ、対応する閉ダブルクォートが存在すれば併せて削除
//   (もし閉ダブルクォートだけが存在しても無視)
// - JSON用エスケープ
UCHAR* urldupJSON( UCHAR* s )
{
	if( s ){
		size_t n = strlen(chomp(s));
		while( *s=='"' ){
			UCHAR* p = s + n -1;
			if( *p=='"' ){ *p = '\0'; n--; }
			s++; n--;
		}
		return strndupJSON(s,n);
	}
	return s;
}










//---------------------------------------------------------------------------------------------------------------
// ブラウザ管理
// ブラウザ情報インデックス
#define BI_IE			0		// IE
#define BI_CHROME		1		// Chrome
#define BI_FIREFOX		2		// Firefox
#define BI_OPERA		3		// Opera
#define BI_USER1		4		// ユーザ指定ブラウザ1
#define BI_USER2		5		// ユーザ指定ブラウザ2
#define BI_USER3		6		// ユーザ指定ブラウザ3
#define BI_USER4		7		// ユーザ指定ブラウザ4
#define BI_COUNT		8
// ブラウザ情報インデックスからブラウザボタンコマンドIDに変換
#define BrowserCommand(i)	((i)+CMD_IE)
// ブラウザボタンコマンドIDからブラウザ情報インデックスに変換
#define CommandBrowser(i)	((i)-CMD_IE)
// ブラウザ情報
typedef struct {
	WCHAR*		name;			// 名前("IE","Chrome"など)
	WCHAR*		exe;			// exeフルパス
	WCHAR*		arg;			// 引数
	BOOL		hide;			// 表示しない
} BrowserInfo;
// ブラウザアイコン
typedef struct {
	HWND		hwnd;			// ウィンドウハンドル
	HICON		icon;			// アイコンハンドル
	WCHAR*		text;			// ツールチップ用テキスト(名前)
} BrowserIcon;

WCHAR* RegValueAlloc( HKEY topkey, const WCHAR* subkey, const WCHAR* name )
{
	WCHAR* value = NULL;
	BOOL ok = FALSE;
	HKEY key;
	if( RegOpenKeyExW( topkey, subkey, 0, KEY_READ, &key )==ERROR_SUCCESS ){
		DWORD type, bytes;
		// データバイト数取得(終端NULL含む)
		if( RegQueryValueExW( key, name, NULL, &type, NULL, &bytes )==ERROR_SUCCESS ){
			// バッファ確保
			value = malloc( bytes );
			if( value ){
				DWORD realbytes = bytes;
				// データ取得
				if( RegQueryValueExW( key, name, NULL, &type, (BYTE*)value, &realbytes )==ERROR_SUCCESS ){
					if( bytes==realbytes ){
						ok = TRUE;
					}
					else LogW(L"RegQueryValueExW(%s)エラー？",value);
				}
				else LogW(L"RegQueryValueExW(%s)エラー%u",subkey,GetLastError());
			}
			else LogW(L"L%u:malloc(%u)エラー",__LINE__,bytes);
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
WCHAR* RegDefaultIconPathAlloc( HKEY topkey, const WCHAR* subkey )
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
WCHAR* RegAppPathAlloc( HKEY topkey, const WCHAR* subkey )
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
// JCBookmark.exeと同階層のファイルパス取得
WCHAR* AppFilePath( const WCHAR* fname )
{
	WCHAR* path = malloc( (MAX_PATH+1)*sizeof(WCHAR) );
	if( path ){
		WCHAR* p;
		GetModuleFileNameW( NULL, path, MAX_PATH );
		path[MAX_PATH] = L'\0';
		p = wcsrchr(path,L'\\');
		if( p ){
			wcscpy( p+1, fname );
			return path;
		}
	}
	if( path ) free( path );
	return NULL;
}
// ブラウザ情報をレジストリや設定ファイルからまとめて取得
BrowserInfo* BrowserInfoAlloc( void )
{
	BrowserInfo* br = malloc( sizeof(BrowserInfo)*BI_COUNT );
	if( br ){
		WCHAR* ini, *exe;
		memset( br, 0, sizeof(BrowserInfo)*BI_COUNT );
		// 既定ブラウザ名
		br[BI_IE].name		= L"IE";
		br[BI_CHROME].name	= L"Chrome";
		br[BI_FIREFOX].name = L"Firefox";
		br[BI_OPERA].name	= L"Opera";
		// 既定ブラウザEXEパス
		br[BI_IE].exe = RegDefaultIconPathAlloc(
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
		br[BI_CHROME].exe = RegAppPathAlloc(
			// TODO:Win7でChromeインストールされてるのに検出できない環境があった。詳細不明。
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
		br[BI_FIREFOX].exe = RegAppPathAlloc(
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
		// TODO:Opera？
		// HKEY_CLASSES_ROOT\Opera.Extension\DefaultIcon
		// HKEY_CLASSES_ROOT\Opera.HTML\DefaultIcon
		// HKEY_LOCAL_MACHINE\SOFTWARE\Classes\Opera.Extension\DefaultIcon
		// HKEY_LOCAL_MACHINE\SOFTWARE\Classes\Opera.HTML\DefaultIcon
		// HKEY_LOCAL_MACHINE\SOFTWARE\Clients\StartMenuInternet\Opera\DefaultIcon
		// HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\Opera.exe
		// 取得パス値がなぜか %1" になっていたという問い合わせあり。
		// 原因不明だが、App Paths 取得して不正っぽかったら DefaultIcon 取得の二段構えにする。
		exe = RegAppPathAlloc(
			HKEY_LOCAL_MACHINE
			,L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Opera.exe"
		);
		if( !exe || (exe && !(wcschr(exe,L'\\') && wcschr(exe,L'.'))) ){
			// App Paths に \ と . が存在しない場合 DefaultIcon を取得する
			if( exe ) free( exe );
			exe = RegDefaultIconPathAlloc(
				HKEY_CLASSES_ROOT
				,L"Opera.HTML\\DefaultIcon" // "D:\Program\Opera\Opera.exe",1
			);
		}
		br[BI_OPERA].exe = exe;
		// 既定ブラウザ引数とユーザ指定ブラウザ
		ini = AppFilePath(L"my.ini");
		if( ini ){
			FILE* fp = _wfopen(ini,L"rb");
			if( fp ){
				UCHAR buf[1024];
				// メモ帳で編集した場合 UTF-8 BOM がつく場合があるので読み飛ばす
				fgets(buf,4,fp); if( !(buf[0]==0xEF && buf[1]==0xBB && buf[2]==0xBF) ) rewind(fp);
				while( fgets(buf,sizeof(buf),fp) ){
					chomp(buf);
					if( strnicmp(buf,"IEArg=",6)==0 && *(buf+6) ){
						br[BI_IE].arg = MultiByteToWideCharAlloc( buf+6, CP_UTF8 );
					}
					else if( strnicmp(buf,"ChromeArg=",10)==0 && *(buf+10) ){
						br[BI_CHROME].arg = MultiByteToWideCharAlloc( buf+10, CP_UTF8 );
					}
					else if( strnicmp(buf,"FirefoxArg=",11)==0 && *(buf+11) ){
						br[BI_FIREFOX].arg = MultiByteToWideCharAlloc( buf+11,CP_UTF8 );
					}
					else if( strnicmp(buf,"OperaArg=",9)==0 && *(buf+9) ){
						br[BI_OPERA].arg = MultiByteToWideCharAlloc( buf+9,CP_UTF8 );
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
						br[BI_USER1].exe = MultiByteToWideCharAlloc( buf+5, CP_UTF8 );
					}
					else if( strnicmp(buf,"Exe2=",5)==0 && *(buf+5) ){
						br[BI_USER2].exe = MultiByteToWideCharAlloc( buf+5, CP_UTF8 );
					}
					else if( strnicmp(buf,"Exe3=",5)==0 && *(buf+5) ){
						br[BI_USER3].exe = MultiByteToWideCharAlloc( buf+5, CP_UTF8 );
					}
					else if( strnicmp(buf,"Exe4=",5)==0 && *(buf+5) ){
						br[BI_USER4].exe = MultiByteToWideCharAlloc( buf+5, CP_UTF8 );
					}
					else if( strnicmp(buf,"Arg1=",5)==0 && *(buf+5) ){
						br[BI_USER1].arg = MultiByteToWideCharAlloc( buf+5, CP_UTF8 );
					}
					else if( strnicmp(buf,"Arg2=",5)==0 && *(buf+5) ){
						br[BI_USER2].arg = MultiByteToWideCharAlloc( buf+5, CP_UTF8 );
					}
					else if( strnicmp(buf,"Arg3=",5)==0 && *(buf+5) ){
						br[BI_USER3].arg = MultiByteToWideCharAlloc( buf+5, CP_UTF8 );
					}
					else if( strnicmp(buf,"Arg4=",5)==0 && *(buf+5) ){
						br[BI_USER4].arg = MultiByteToWideCharAlloc( buf+5, CP_UTF8 );
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
WCHAR* ExpandEnvironmentStringsAlloc( const WCHAR* path )
{
	DWORD length = ExpandEnvironmentStringsW( path, NULL, 0 );
	WCHAR* path2 = malloc( length * sizeof(WCHAR) );
	if( path2 ){
		ExpandEnvironmentStringsW( path, path2, length );
	}
	else LogW(L"L%u:malloc(%u)エラー",__LINE__,length*sizeof(WCHAR));
	return path2;
}
WCHAR* myPathResolve( const WCHAR* path )
{
	WCHAR* realpath = NULL;
	if( path ){
		// 環境変数(%windir%など)展開
		WCHAR* path2 = ExpandEnvironmentStringsAlloc( path );
		if( path2 ){
			if( PathIsRelativeW(path2) ){
				// 相対パス
				WCHAR* ext = wcsrchr(path2,L'.');
				WCHAR dir[MAX_PATH+1]=L"";
				GetCurrentDirectoryW( sizeof(dir)/sizeof(WCHAR), dir );
				if( SetCurrentDirectorySelf() ){
					// 自身のディレクトリおよび環境変数PATHから検索
					realpath = malloc( (MAX_PATH+1)*sizeof(WCHAR) );
					if( realpath ){
						*realpath = L'\0';
						if( !ext ) FindExecutableW( path2, NULL, realpath );
						if( !*realpath ) SearchPathW( NULL, path2, NULL, MAX_PATH, realpath, NULL );
						if( !*realpath ) free( realpath ), realpath=NULL;
					}
					else LogW(L"L%u:malloc(%u)エラー",__LINE__,(MAX_PATH+1)*sizeof(WCHAR));
					SetCurrentDirectoryW( dir );
				}
				if( !realpath && PathIsFileSpecW(path2) ){
					// パス区切り(:\)なし、レジストリ App Paths 自力参照
					// http://msdn.microsoft.com/en-us/library/windows/desktop/ee872121(v=vs.85).aspx
					// HKEY_CURRENT_USER 優先、HKEY_LOCAL_MACHINE が後
					#define APP_PATH L"Microsoft\\Windows\\CurrentVersion\\App Paths"
					WCHAR key[MAX_PATH+1];
					WCHAR* value;
					_snwprintf(key,sizeof(key),L"Software\\%s\\%s",APP_PATH,path2);
					value = RegAppPathAlloc( HKEY_CURRENT_USER, key );
					if( value ){
						// レジストリキー名と実行ファイル名は同じでないとダメという仕様にも思えたが
						// Opera17がそうではなく(キー名Opera.exeで実行ファイルがlauncher.exe)、
						// >start opera でも起動できたので、キー名＝ファイル名チェックはしない。
						//if( wcsicmp(path2,PathFindFileNameW(value))==0 ) realpath=value;
						//else free( value );
						realpath = value;
					}
					if( !realpath ){
						_snwprintf(key,sizeof(key),L"SOFTWARE\\%s\\%s",APP_PATH,path2);
						value = RegAppPathAlloc( HKEY_LOCAL_MACHINE, key );
						if( value ){
							//if( wcsicmp(path2,PathFindFileNameW(value))==0 ) realpath=value;
							//else free( value );
							realpath = value;
						}
					}
					if( !realpath && !ext ){
						// ドット(拡張子)なしの場合は .exe 補完(chrome→chrome.exe)
						WCHAR* exe = wcsjoin( path2, L".exe", 0,0,0 );
						if( exe ){
							_snwprintf(key,sizeof(key),L"Software\\%s\\%s",APP_PATH,exe);
							value = RegAppPathAlloc( HKEY_CURRENT_USER, key );
							if( value ){
								//if( wcsicmp(exe,PathFindFileNameW(value))==0 ) realpath=value;
								//else free( value );
								realpath = value;
							}
							if( !realpath ){
								_snwprintf(key,sizeof(key),L"SOFTWARE\\%s\\%s",APP_PATH,exe);
								value = RegAppPathAlloc( HKEY_LOCAL_MACHINE, key );
								if( value ){
									//if( wcsicmp(exe,PathFindFileNameW(value))==0 ) realpath=value;
									//else free( value );
									realpath = value;
								}
							}
							free( exe );
						}
					}
				}
				if( realpath ){
					// App Paths が環境変数入りパスの場合がある
					WCHAR* realpath2 = ExpandEnvironmentStringsAlloc( realpath );
					if( realpath2 ){
						free( realpath );
						realpath = realpath2;
					}
				}
				else LogW(L"\"%s\"が見つかりません",path);
			}
			else{
				// 絶対パス
				if( PathFileExistsW( path2 ) ){
					realpath = wcsdup( path2 );
					if( !realpath ) LogW(L"L%u:wcsdupエラー",__LINE__);
				}
				else{
					realpath = malloc( (MAX_PATH+1)*sizeof(WCHAR) );
					if( realpath ){
						*realpath = L'\0';
						FindExecutableW( path2, NULL, realpath );
						if( !*realpath ){
							LogW(L"\"%s\"が見つかりません",path);
							free( realpath ), realpath=NULL;
						}
					}
					else LogW(L"L%u:malloc(%u)エラー",__LINE__,(MAX_PATH+1)*sizeof(WCHAR));
				}
			}
			free( path2 );
		}
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
		WCHAR* realpath = myPathResolve( path );
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














//---------------------------------------------------------------------------------------------------------------
// クライアントコネクション管理
//
typedef struct {
	UCHAR*		buf;				// リクエスト受信バッファ
	UCHAR*		method;				// GET/PUT
	UCHAR*		path;				// パス
	UCHAR*		param;				// パラメータ
	UCHAR*		ver;				// HTTPバージョン
	UCHAR*		head;				// HTTPヘッダ開始位置
	UCHAR*		ContentType;		// Content-Type
	UCHAR*		UserAgent;			// User-Agent
	UCHAR*		IfModifiedSince;	// If-Modified-Since
	UCHAR*		Cookie;				// Cookie
	UCHAR*		body;				// リクエストボディ開始位置
	UCHAR*		boundary;			// Content-Type:multipart/form-dataのboundary
	HANDLE		writefh;			// 書出ファイルハンドル
	DWORD		wrote;				// 書出済みバイト
	UINT		ContentLength;		// Content-Length値
	UINT		bytes;				// 受信バッファ有効バイト
	size_t		bufsize;			// 受信バッファサイズ
//#define HTTP_KEEPALIVE
#ifdef HTTP_KEEPALIVE
	UCHAR		KeepAlive;			// Connection:Keep-Aliveかどうか(1/0)
#endif
} Request;

typedef struct {
	UCHAR*		top;				// バッファ先頭
	UINT		bytes;				// 有効バイト
	size_t		size;				// 全体サイズ
} Buffer;

typedef struct {
	Buffer		head;				// レスポンスヘッダ
	Buffer		body;				// レスポンスボディ
	HANDLE		readfh;				// 送信ファイルハンドル
	DWORD		readed;				// 送信ファイル読込済みバイト
	UINT		sended;				// 送信済みバイト
} Response;

typedef struct Session {
	struct Session* next;
	UCHAR id[1];					// セッションID文字列
} Session;

typedef struct TClient {
	SOCKET		sock;				// クライアント接続ソケット
	SSL*		sslp;				// SSL
	UINT		status;				// 接続状態フラグ
	#define		CLIENT_ACCEPT_OK	1	// accept完了
	#define		CLIENT_RECV_MORE	2	// 受信中
	#define		CLIENT_SEND_READY	3	// 送信準備完了
	#define		CLIENT_SENDING		4	// 送信中
	#define		CLIENT_THREADING	5	// スレッド処理中
	#define		CLIENT_KEEP_ALIVE	6	// KeepAlive待機中
	Request		req;
	Response	rsp;
	Session*	session;			// 有効セッション
	HANDLE		thread;
	UINT		silent;				// 無通信監視カウンタ
	UCHAR		abort;				// 中断フラグ
	UCHAR		loopback;			// loopbackからの接続フラグ
} TClient;

//	Connection:keep-aliveを導入したところFirefoxで「同時接続数オーバー」がたくさん出るようになった。
//	Firefoxだけで24本くらい接続を張るもよう。keep-aliveやめたら8本くらいしか使わないようだ。ChromeやOpera
//	ではこんなに挙動に違いはない。keep-alive無効なら16本で充分。keep-alive有効だとFirefoxのために64本くらい
//	あった方が安心。keep-aliveでどのくらい速くなっているか？なんとなく速い気もするが・・。とりあえず
//	keep-alive有効64本同時接続で使ってみる。JCBookmark.exeリソース消費増加はわずかなもよう。
//	keep-alive有無の切り替えをオプション(隠しパラメータ)にする？
#ifdef HTTP_KEEPALIVE
#define		CLIENT_MAX			64					// クライアント最大同時接続数
#else
#define		CLIENT_MAX			16					// クライアント最大同時接続数
#endif
TClient		Client[CLIENT_MAX]	= {0};				// クライアント
WCHAR*		DocumentRoot		= NULL;				// ドキュメントルートフルパス
size_t		DocumentRootLen		= 0;				// wcslen(DocumentRoot)

// TClientポインタが何番目のクライアントか返却
#define Num(p) ( (p)? (p) - Client : -1 )
// 指定ソケットを持つTClientポインタを返却
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
// クライアント接続毎一時ファイル
WCHAR* ClientTempPath( TClient* cp, WCHAR* path, size_t size )
{
	_snwprintf(path,size,L"%s\\$%u",DocumentRoot,Num(cp));
	path[size-1]=L'\0';
	return path;
}
// ソケットを(WSAAsyncSelect非同期から)同期(ブロッキング)モードに
void SocketBlocking( SOCKET sock )
{
	u_long off = 0;
	WSAAsyncSelect( sock ,MainForm ,0,0 );
	ioctlsocket( sock, FIONBIO, &off );
}
void ClientShutdown( TClient* cp )
{
	WCHAR wpath[MAX_PATH+1]=L"";
	if( cp ){
		CloseHandle( cp->thread );
		CloseHandle( cp->req.writefh );
		CloseHandle( cp->rsp.readfh );
		DeleteFileW( ClientTempPath(cp,wpath,sizeof(wpath)/sizeof(WCHAR)) );
		if( cp->sslp ){
			SocketBlocking( cp->sock );
			SSL_shutdown( cp->sslp );
			SSL_free( cp->sslp );
		}
		if( cp->sock !=INVALID_SOCKET ){
			if( !cp->sslp ) SocketBlocking( cp->sock );
			shutdown( cp->sock, SD_BOTH );
			closesocket( cp->sock );
		}
		// TODO:別アプリでCPU負荷を上げた状態で、ブラウザでfiler.htmlのリロード/中止を
		// 繰り返すとここで落ちることがある。「Runtime Error」とかいうダイアログが出る。
		// SocketClose()->ClientShutdown()->free( cp->req.buf )
		// free() から先でエラーになっているようだが、しかしポインタ値はNULLではなく、
		// なぜ落ちるのか変数値からは不明。二重free()しているのか？？
		// 発生頻度はかなり稀。いまのところIE8で発生したのみ。Win7+IE11(VirtualBox含む)
		// だと高負荷でなくても発生するようだが、VC9のIDEから実行できないのでダンプ採取
		// してWinDbgで見ることになり面倒。一度採取できたダンプは同じ箇所で落ちていた。
		// 頻度の稀さからアプリ側ではなくOS側と思いたいが…。
		if( cp->req.buf ) free( cp->req.buf );
		if( cp->rsp.head.top ) free( cp->rsp.head.top );
		if( cp->rsp.body.top ) free( cp->rsp.body.top );
		ClientInit( cp );
	}
}
BOOL BufferSize( Buffer* bp, size_t bytes )
{
	if( bp->top && bp->size >0 ){ // 高負荷時bp->sizeが0で無限ループした事があり事前チェック
		size_t need = bp->bytes + bytes;
		if( need > bp->size ){
			// バッファ拡大
			UCHAR* newtop;
			size_t newsize = bp->size * 2;
			while( need > newsize ) newsize *= 2;
			newtop = malloc( newsize );
			if( newtop ){
				memset( newtop, 0, newsize );
				memcpy( newtop, bp->top, bp->bytes );
				free( bp->top );
				bp->top = newtop;
				bp->size = newsize;
				LogW(L"送信バッファ拡大%ubytes",newsize);
				return TRUE;
			}
			LogW(L"L%u:malloc(%u)エラー",__LINE__,newsize);
			return FALSE;
		}
		return TRUE;
	}
	return FALSE;
}
void BufferSend( Buffer* bp, const UCHAR* data, size_t bytes )
{
	if( BufferSize( bp, bytes ) ){
		memcpy( bp->top + bp->bytes, data, bytes );
		bp->bytes += bytes;
	}
}
void BufferSendFile( Buffer* bp, const WCHAR* path )
{
	HANDLE hFile = CreateFileW( path, GENERIC_READ, FILE_SHARE_READ
							,NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL
	);
	if( hFile !=INVALID_HANDLE_VALUE ){
		DWORD bytes = GetFileSize( hFile, NULL );
		if( BufferSize( bp, bytes ) ){
			DWORD bRead=0;
			if( ReadFile( hFile, bp->top + bp->bytes, bytes, &bRead, NULL ) && bytes==bRead ){
				bp->bytes += bytes;
			}
			else LogW(L"L%u:ReadFileエラー%u",__LINE__,GetLastError());
		}
		CloseHandle( hFile );
	}
	else LogW(L"L%u:CreateFile(%s)エラー%u",__LINE__,path,GetLastError());
}
#define BufferSends(bp,txt) BufferSend(bp,txt,strlen(txt))
void BufferSendf( Buffer* bp, const UCHAR* fmt, ... )
{
	UCHAR msg[256];
	va_list arg;

	msg[sizeof(msg)-1]='\0';

	va_start( arg, fmt );
	_vsnprintf( msg, sizeof(msg), fmt, arg );
	va_end( arg );

	if( msg[sizeof(msg)-1]=='\0' ){
		BufferSends( bp ,msg );
	}
	else{
		// バッファ不足ヒープ使う
		size_t bufsiz = 512;
		UCHAR* buf = malloc( bufsiz );
		if( buf ){
		retry:
			buf[bufsiz-1]='\0';

			va_start( arg, fmt );
			_vsnprintf( buf, bufsiz, fmt, arg );
			va_end( arg );

			if( buf[bufsiz-1]=='\0' ){
				LogW(L"送信一時バッファ確保%ubytes",bufsiz);
				BufferSends( bp ,buf );
				free( buf );
			}
			else{
				free( buf );
				bufsiz += bufsiz;	// 2倍
				buf = malloc( bufsiz );
				if( buf ){
					goto retry;
				}
				else LogW(L"malloc(%u)エラー送信データ破棄",bufsiz);
			}
		}
	}
}
void ResponseError( TClient* cp ,const UCHAR* txt )
{
	BufferSends( &(cp->rsp.body) ,txt );
	BufferSendf( &(cp->rsp.head)
		,"HTTP/1.0 %s\r\n"
		"Content-Type: text/plain; charset=utf-8\r\n"
		"Content-Length: %u\r\n"
		,txt
		,cp->rsp.body.bytes
	);
}
void ResponseEmpty( TClient* cp )
{
	cp->rsp.head.bytes = cp->rsp.body.bytes = 0;
	cp->rsp.head.top[0] = cp->rsp.body.top[0] = '\0';
}
#define isblank(c) ((c)==' ' || (c)=='\t') // C99にあるらしい
UCHAR* strHeaderValue( const UCHAR* buf, const UCHAR* name )
{
	if( buf && name ){
		UCHAR* value = buf;
		size_t len = strlen( name );
		for( ; *value; value++ ){
			if( strnicmp( value, name, len )==0 ){
				if( buf==value || (buf < value && *(value-1)=='\n') ){
					value += len;
					if( *value==':' || isblank(*value) ){
						while( isblank(*value) ) value++;
						if( *value==':' ){
							value++;
							while( isblank(*value) ) value++;
							//LogA("%s:%s",name,value);
							return value;
						}
					}
					else value--;
				}
				else value += len-1;
			}
		}
	}
	return NULL;
}








//---------------------------------------------------------------------------------------------------------------
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
			WCHAR* value = malloc( bytes );
			if( value ){
				// データ取得
				if( RegQueryValueExW( key, name, NULL, &type, (BYTE*)value, &bytes )==ERROR_SUCCESS ){
					// 環境変数展開
					path = ExpandEnvironmentStringsAlloc( value );
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
	//UCHAR*				title;		// タイトル
	UCHAR*				url;		// サイトURL
	UCHAR*				icon;		// favicon URL
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
NodeList* NodeCreate( const WCHAR* name, const UCHAR* url, const UCHAR* icon )
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
	node = malloc( bytes );
	if( node ){
		BYTE* p = (BYTE*)(node+1);
		memset( node, 0, bytes );
		node->sortIndex = UINT_MAX;
		if( name ){
			memcpy(p,name,namesize);
			node->name = (WCHAR*)p;
			p += namesize;
		}
		if( url ){
			memcpy(p,url,urlsize);
			node->url = (UCHAR*)p;
			p += urlsize;
		}
		if( icon ){
			memcpy(p,icon,iconsize);
			node->icon = (UCHAR*)p;
			p += iconsize;
		}
	}
	else LogW(L"L%u:malloc(%u)エラー",__LINE__,bytes);
	return node;
}

NodeList* FolderFavoriteListCreate( const WCHAR* wdir )
{
	NodeList* folder = NULL;
	WCHAR* wfindir = wcsjoin( wdir, L"\\*", 0,0,0 );
	if( wfindir ){
		WIN32_FIND_DATAW wfd;
		HANDLE handle = FindFirstFileW( wfindir, &wfd );
		if( handle !=INVALID_HANDLE_VALUE ){
			// フォルダノード
			folder = NodeCreate( wcsrchr(wdir,L'\\')+1, NULL, NULL );
			if( folder ){
				NodeList* last = NULL;
				folder->isFolder = TRUE;
				do{
					if( wcscmp(wfd.cFileName,L"..") && wcscmp(wfd.cFileName,L".") ){
						WCHAR *wpath = wcsjoin( wdir, L"\\", wfd.cFileName, 0,0 );
						if( wpath ){
							NodeList* node = NULL;
							if( wfd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY ){
								// ディレクトリ再帰
								node = FolderFavoriteListCreate( wpath );
							}
							else{
								// ファイル
								WCHAR* dot = wcsrchr( wfd.cFileName, L'.' );
								if( dot && wcsicmp(dot+1,L"URL")==0 ){
									// 拡張子url
									UCHAR *url=NULL, *icon=NULL;
									FILE* fp = _wfopen( wpath, L"rb" );
									if( fp ){
										UCHAR line[1024];
										while( fgets( line, sizeof(line), fp ) ){
											if( strnicmp(line,"URL=",4)==0 ){
												url = urldupJSON(line+4);
											}
											else if( strnicmp(line,"IconFile=",9)==0 ){
												icon = urldupJSON(line+9);
											}
											if( url && icon ) break;
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
					}
				}
				while( FindNextFileW( handle, &wfd ) );
			}
			FindClose( handle );
		}
		else LogW(L"FindFirstFileW(%s)エラー%u",wfindir,GetLastError());
		free( wfindir );
	}
	return folder;
}
// お気に入り並び順をレジストリから取得
// http://www.arstdesign.com/articles/iefavorites.html
// http://mikeo410.lv9.org/lumadcms/~IE_FAVORITES_XBEL
// http://www.atmark.gr.jp/~s2000/r/memo.txt
// http://www.codeproject.com/Articles/22267/Internet-Explorer-Favorites-deconstructed
// http://deployment.xtremeconsulting.com/2010/09/24/windows-7-ie8-favorites-bar-organization-a-descent-into-binary-registry-storage/
// http://veryie.googlecode.com/svn/trunk/src/Menuorder.cpp
typedef struct {
	DWORD		bytes;		// 構造体バイト数(longnameまで含む全体)
	DWORD		sortIndex;
	WORD		key1;		// ここから構造体終端までのバイト数(常にbytes-14)
	WORD		key2;		// bit0不明, bit1=1(URL)0(フォルダ), bit2=1(UNICODE)0(非UNICODE)
	DWORD		x0;
	DWORD		x1;
	WORD		key3;		// 0x0010はURL, 0x0020はフォルダ。key2と同じなので使わない。
	BYTE		name[1];	// 可変長ファイル(フォルダ)名。非UNICODEの場合は8.3形式NULL終端文字列。UNICODEでフォルダの場合5文字までならそのまま、6文字以上は謎のゴミつき文字列。UNICODEでURLの場合は9文字までならそのまま、10文字以上は謎のゴミつき文字列。ゴミがついている場合でもいちおうNULL終端しているもよう。
} RegFavoriteOrderItem;

typedef struct {
	DWORD					x0;
	DWORD					x1;
	DWORD					bytes;		// 全体バイト数
	DWORD					x2;
	DWORD					itemCount;	// アイテム(レコード)数
	RegFavoriteOrderItem	item[1];	// 先頭アイテム
} RegFavoriteOrder;

// shortname と longname の間にある謎の20～42バイトが常に「xx 00 03 00 04」(16進)になる？
// という非公式情報を元に実装したところ、XPはうまく動いた。
// Win7 Home Premium SP1 日本語版は、謎の20～42バイトが「xx 00 08 00 04」になってるもよう。
// Vistaではまた違うのか？Vistaが無いのでわからない。これを目印にするのは危険だろうか？
// とりあえず「xx 00 xx 00 04」を目印にして手元のXP,7はどちらもうまく動いている。。
void FavoriteOrder( NodeList* folder, const WCHAR* subkey, size_t magicBytes )
{
	if( folder ){
		HKEY key;
		if( RegOpenKeyExW( HKEY_CURRENT_USER, subkey, 0, KEY_READ, &key )==ERROR_SUCCESS ){
			WCHAR* name = L"Order";
			DWORD type, bytes;
			// データサイズ取得(終端NULL含む)
			if( RegQueryValueExW( key, name, NULL, &type, NULL, &bytes )==ERROR_SUCCESS ){
				RegFavoriteOrder* order = malloc( bytes );
				if( order ){
					BYTE* limit = (BYTE*)order + bytes;
					// データ取得
					if( RegQueryValueExW( key, name, NULL, &type, (BYTE*)order, &bytes )==ERROR_SUCCESS ){
						RegFavoriteOrderItem* item = order->item;
						DWORD count=0;
//#define DEBUGLOG
#ifdef DEBUGLOG
						LogW(L"FavoriteOrder[%s]: %ubytes itemCount=%u %ubytes",wcsrchr(subkey,L'\\'),bytes,order->itemCount,order->bytes);
#endif
						while( (BYTE*)item < limit ){
							BOOL isURL = (item->key2 & 0x0002) ? TRUE : FALSE; // url or folder
							BOOL isUnicode = (item->key2 & 0x0004) ? TRUE : FALSE; // unicode encoding or codepage encoding
							BYTE* longname;
							size_t len;
							NodeList* node;
#ifdef DEBUGLOG
							WCHAR* shortname;
#endif
							// nameの次にさらに可変長のUNICODE長いファイル(フォルダ)名が格納されている。
							// 可変長が2つ続いており構造体にできないためここで取り出す。
							if( isUnicode ){
								// nameがUNICODEの場合、NULL終端している場合としてない場合があり、どちらも
								// 謎の20～42バイトをはさんで長いファイル名が始まる。NULL終端していない場合
								// でも、どうやら謎の20～42バイトの最後がNULL終端と同等のようで、wcslenでは
								// ちょうど謎の20～42バイトの終わりまでが文字列と判定されるもよう。また謎の
								// 20～42バイトは、XPでは常に16進「xx 00 03 00 04」になるらしい(非公式情報)。
								// Win7では「xx 00 08 00 04」、Vistaは不明。とりあえず「xx 00 xx 00 04」を
								// 目印にして手元のXP,7はどちらもうまく動いている。。
								#define magicTag(p) ( (p)[0] && (p)[1]==0x00 && (p)[2] && (p)[3]==0x00 && (p)[4]==0x04 )
								len = wcslen((WCHAR*)item->name);
								longname = (BYTE*)((WCHAR*)item->name + len + 1);
								if( magicTag(longname) ){
									// NULL終端している＝longnameは謎の20～42バイトの先頭。
									longname += magicBytes;
								}
								else{
									// NULL終端していない＝longnameは謎の20～42バイトの次。
									// 謎の20～42バイトの先頭を探す。後から探すか前から探すかどっちがいいか？わからん。
									BYTE* p;
									//for( p=item->name; p<longname; p++ ){
									for( p=longname-5;p>=item->name; p-- ){
										if( magicTag(p) ) break;
									}
									//if( p < longname ){
									if( p >= item->name ){
										len = (p - item->name)/sizeof(WCHAR);
										longname = p + magicBytes;
									}
									else{
										LogW(L"不明Orderエントリ");
									}
								}
#ifdef DEBUGLOG
								shortname = wcsndup( (WCHAR*)item->name, len );
#endif
							}
							else{
								// nameが非UNICODEの場合、NULL文字含めたnameの長さを偶数にするためのパディング
								// バイトと、さらに謎の20～42バイトをはさんで長いファイル名(NULL終端)が続く。
								len = strlen(item->name) + 1;
								// make sure to take into account that we are at an uneven position
								longname = item->name + len + ((len%2)?1:0);
								// pass dummy bytes
								longname += magicBytes;
#ifdef DEBUGLOG
								shortname = MultiByteToWideCharAlloc( item->name, CP_UTF8 );
#endif
							}
#ifdef DEBUGLOG
							LogW(L"FavoriteOrderItem%u: %ubytes sortIndex=%u key1=%u Url=%u Unicode=%u ?=%u ?=%u shortname(%u)=%s [%02x %02x %02x %02x %02x - %02x %02x %02x %02x %02x] longname=%s"
									,count++,item->bytes,item->sortIndex,item->key1,isURL,isUnicode,item->x0,item->x1,len,shortname
									,*(longname-magicBytes+0)
									,*(longname-magicBytes+1)
									,*(longname-magicBytes+2)
									,*(longname-magicBytes+3)
									,*(longname-magicBytes+4)
									,*(longname-5)
									,*(longname-4)
									,*(longname-3)
									,*(longname-2)
									,*(longname-1)
									,(WCHAR*)longname
							);
							if( shortname ) free(shortname), shortname=NULL;
#endif
							// ノードリストの該当ノードにソートインデックスをセット
							for( node=folder->child; node; node=node->next ){
								if( wcsicmp(node->name,(WCHAR*)longname)==0 ){
									node->sortIndex = item->sortIndex;
									break;
								}
							}
							// フォルダ
							if( !isURL ){
								WCHAR* subkey2 = wcsjoin( subkey, L"\\", (WCHAR*)longname, 0,0 );
								if( subkey2 ){
									FavoriteOrder( node, subkey2, magicBytes );
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
NodeList* NodeListSort( NodeList* top, int (*isReversed)( const NodeList* ,const NodeList* ) )
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
int NodeIndexCompare( const NodeList* p1, const NodeList* p2 )
{
	// ソートインデックスが小さいものを前に
	if( p1->sortIndex > p2->sortIndex ) return 1;
	return 0;
}
int NodeNameCompare( const NodeList* p1, const NodeList* p2 )
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
int NodeTypeCompare( const NodeList* p1, const NodeList* p2 )
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
		size_t magicBytes=0;	// Windows種類により異なるレジストリOrderバイナリレコード謎の無視バイト数
		OSVERSIONINFOA os;
		// [WindowsのOS判定]
		// http://cherrynoyakata.web.fc2.com/sprogram_1_3.htm
		// http://www.westbrook.jp/Tips/Win/OSVersion.html
		memset( &os, 0, sizeof(os) );
		os.dwOSVersionInfoSize = sizeof(os);
		GetVersionExA( &os );
		//LogW(L"Windows%u.%u",os.dwMajorVersion,os.dwMinorVersion);
		switch( os.dwMajorVersion ){
		case 5: magicBytes = 20; break;	// XP,2003
		case 6: // Vista以降
			switch( os.dwMinorVersion ){
			case 0: magicBytes = 38; break;	// Vista,2008
			case 1: magicBytes = 42; break;	// 7,2008R2
			case 2: magicBytes = 42; break;	// 8,2012
			}
			break;
		}
		// レジストリのソートインデックス取得
		FavoriteOrder(
				list
				,L"Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\MenuOrder\\Favorites"
				,magicBytes
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
void NodeListJSON( NodeList* node, FILE* fp, UINT* nextid, UINT depth, const UCHAR* view )
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
		UCHAR* title = WideCharToUTF8alloc( node->name );
		UCHAR* dot = strrchr(title,'.');
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
// 外部接続・HTTPクライアント関連
//
// ANSIとUnicodeと共通化できない…
UCHAR* FileContentTypeA( const UCHAR* file )
{
	if( file ){
		UCHAR* ext = strrchr(file,'.');
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
			//if( stricmp(ext,"ico")==0 )  return "image/vnd.microsoft.icon"; // IE8で表示されないためx-iconに変更
			if( stricmp(ext,"ico")==0 )  return "image/x-icon";
			if( stricmp(ext,"svg")==0 )  return "image/svg+xml";
			if( stricmp(ext,"svgz")==0 ) return "image/svg+xml";
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
UCHAR* FileContentTypeW( const WCHAR* file )
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
			//if( wcsicmp(ext,L"ico")==0 )  return "image/vnd.microsoft.icon"; // IE8で表示されないためx-iconに変更
			if( wcsicmp(ext,L"ico")==0 )  return "image/x-icon";
			if( wcsicmp(ext,L"svg")==0 )  return "image/svg+xml";
			if( wcsicmp(ext,L"svgz")==0 ) return "image/svg+xml";
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

UCHAR* strWeekday( WORD wDayOfWeek )
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

UCHAR* strMonth( WORD wMonth )
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
UINT64 UINT64InetTime( const UCHAR* intime )
{
	SYSTEMTIME st;
	FILETIME ft;
	InternetTimeToSystemTimeA( intime, &st, 0 );
	SystemTimeToFileTime( &st, &ft );
	return *(UINT64*)&ft;
}

// 外部URL GET結果
typedef struct {
	size_t		bufsize;		// 受信バッファサイズ
	size_t		bytes;			// 受信バッファ有効バイト
	UCHAR*		head;			// レスポンスヘッダ開始
	UCHAR*		body;			// レスポンス本文開始
	UINT		ContentLength;	// Content-Length値
	UCHAR		ContentType;	// Content-Type識別
	#define		TYPE_HTML		0x01
	#define		TYPE_OTHER		0xff
	UCHAR		charset;		// 文字コード識別
	#define		CS_UTF8			0x01
	#define		CS_SJIS			0x02
	#define		CS_EUC			0x03
	#define		CS_JIS			0x04
	#define		CS_OTHER		0xff
	UCHAR		ContentEncoding;// Content-Encoding
	#define		ENC_GZIP		0x01
	#define		ENC_DEFLATE		0x02
	#define		ENC_OTHER		0xff
	UCHAR		buf[1];			// 受信バッファ(可変長文字列)
} HTTPGet;

// 死活確認結果報告用
typedef struct {
	UCHAR	grp;		// グループ識別文字
	UCHAR	msg[256];	// メッセージ
	UCHAR*	newurl;		// 転送先(変更)URL
} PokeReport;

// 外部クッキー
// Set-Cookie: NAME=VALUE; expires=DATE; domain=DOMAIN; path=PATH; secure HttpOnly
typedef struct Cookie {
	struct Cookie* next;	// 次のクッキー
	UCHAR*	value;			// VALUE
	UCHAR*	domain;			// ドメイン
	size_t	domainlen;		// ドメインバイト数
	UCHAR*	path;			// パス
	size_t	pathlen;		// パスバイト数
	UCHAR*	expire;			// 期限
	UCHAR	secure;			// secure属性有無
	UCHAR	match;			// リクエストクッキー生成時に使うフラグ変数
	UCHAR	name[1];		// NAME(と他のメンバのポイント先になる可変長バッファ)
} Cookie;

// HTTPクライアント
HTTPGet* httpGET( const UCHAR* url ,const UCHAR* ua ,const UCHAR* abort ,PokeReport* rp ,const UCHAR* cookie )
{
	#define		HTTPGET_BUFSIZE	(1024*16) // 初期バッファサイズあまり拡大が発生しない程度の大きさに
	HTTPGet*	rsp				= NULL;
	BOOL		isSSL			= FALSE;
	// プロトコル
	if( !url || !*url ){
		LogW(L"URLが空です");
		if( rp ) rp->grp='E' ,strcpy(rp->msg,"URLが空です");
		goto fin;
	}
	if( strnicmp(url,"http://",7)==0 ){
		url += 7;
	}
	else if( strncmp(url,"//",2)==0 ){ // スキーム省略:呼び出し側でないとhttpなのかhttpsなのか不明だがhttpとして処理
		url += 2;
	}
	else if( strnicmp(url,"https://",8)==0 ){
		url += 8;
		if( ssl_ctx ) isSSL = TRUE;
		else{
			LogW(L"SSL利用できません");
			if( rp ) rp->grp='?' ,strcpy(rp->msg,"SSL利用できません");
			goto fin;
		}
	}
	else{
		LogA("不明なプロトコル:%s",url);
		if( rp ) rp->grp='E' ,strcpy(rp->msg,"不明なプロトコル");
		goto fin;
	}
	// ホスト名
	if( *url ){
		UCHAR* host;
		UCHAR* path = strchr(url,'/');
		if( path ){
			host = strndup( url, path - url );
			path++;
		}
		else{
			host = strdup( url );
			path = "";
		}
		if( host ){
			// 名前解決
			// TODO:WSAAsyncGetHostByNameが非同期名前解決だがメッセージ受信型？
			// http://keicode.com/windows/async-gethostbyname.php
			ADDRINFOA*	addr = NULL;
			ADDRINFOA	hint;
			UCHAR*		port = strrchr(host,':');
			if( port ) *port++ ='\0'; else port = isSSL?"443":"80";
			memset( &hint, 0, sizeof(hint) );
			hint.ai_socktype = SOCK_STREAM;
			hint.ai_protocol = IPPROTO_TCP;
			if( GetAddrInfoA( host, port, &hint, &addr )==0 && !*abort ){
				// 接続(イベント型ノンブロックソケットでタイムアウト監視)
				BOOL		connected	= FALSE;
				SOCKET		sock		= socket( addr->ai_family, addr->ai_socktype, addr->ai_protocol );
				WSAEVENT	ev			= WSACreateEvent();
				if( WSAEventSelect( sock, ev, FD_CONNECT ) !=SOCKET_ERROR ){
					u_long off = 0;
					int err = connect( sock, addr->ai_addr, (int)addr->ai_addrlen );
					if( err !=SOCKET_ERROR || WSAGetLastError()==WSAEWOULDBLOCK ){
						WSANETWORKEVENTS nev;
						DWORD dwRes = WSAWaitForMultipleEvents( 1, &ev, FALSE, 5000, FALSE );
						switch( dwRes ){
						case WSA_WAIT_EVENT_0:
							if( WSAEnumNetworkEvents( sock, ev, &nev ) !=SOCKET_ERROR ){
								if( (nev.lNetworkEvents & FD_CONNECT) && nev.iErrorCode[FD_CONNECT_BIT]==0 ){
									connected = TRUE; // 接続成功
								}
								else{
									// TODO:Connection Refused もここを通るようだが、WSAGetLastError()が
									// WSAECONNREFUSED ではなく WSAEWOULDBLOCK になるのはなぜ・・・
									LogA("[%u]connect失敗%u(%s:%s)",sock,WSAGetLastError(),host,port);
									if( rp ) rp->grp='E' ,strcpy(rp->msg,"接続できません");
								}
							}
							else{
								LogW(L"[%u]WSAEnumNetworkEventsエラー%u",sock,WSAGetLastError());
								if( rp ) rp->grp='?' ,strcpy(rp->msg,"サーバー内部エラー");
							}
							break;
						case WSA_WAIT_TIMEOUT:
							LogA("[%u]connectタイムアウト(%s:%s)",sock,host,port);
							if( rp ) rp->grp='?' ,strcpy(rp->msg,"接続タイムアウト");
							break;
						case WSA_WAIT_FAILED:
						default:
							LogW(L"[%u]WSAWaitForMultipleEventsエラー%u",sock,dwRes);
							if( rp ) rp->grp='?' ,strcpy(rp->msg,"サーバー内部エラー");
						}
					}
					WSAEventSelect( sock, NULL, 0 );		// イベント型終了
					ioctlsocket( sock, FIONBIO, &off );		// ブロッキングに戻す
				}
				else{
					LogW(L"[%u]WSAEventSelectエラー%u",sock,WSAGetLastError());
					if( rp ) rp->grp='?' ,strcpy(rp->msg,"サーバー内部エラー");
				}
				WSACloseEvent( ev );
				// 送受信
				if( connected && !*abort ){
					struct timeval tv = { 5, 0 };
					SSL* sslp = NULL;
					BOOL ssl_ok = TRUE;
					// send/recvタイムアウト指定
					// 受信はreadable()も使っているので変かもしれないけどまあいいか…
					setsockopt( sock, SOL_SOCKET, SO_SNDTIMEO, (char*)&tv, sizeof(tv) );
					setsockopt( sock, SOL_SOCKET, SO_RCVTIMEO, (char*)&tv, sizeof(tv) );
					if( isSSL ){
						sslp = SSL_new( ssl_ctx );
						if( sslp ){
							int ret ,retry=0;
							SSL_set_fd( sslp, sock );		// ソケットをSSLに紐付け
							RAND_poll();
							while( RAND_status()==0 ){		// PRNG初期化
								unsigned short rand_ret = rand() % 65536;
								RAND_seed(&rand_ret, sizeof(rand_ret));
							}
						retry:
							ret = SSL_connect( sslp );		// SSLハンドシェイク
							if( ret==1 ) LogA("[%u]外部接続(SSL):%s:%s",sock,host,port);
							else{
								int err = SSL_get_error( sslp, ret );
								if( ret==-1 && err==SSL_ERROR_SYSCALL ){
									// 同時通信負荷が高いとこのエラーになる時がある。
									// amazonとの通信が他に複数ある中でSSLサイトに接続しようとした時に発生。
									// 自宅では70弱の同時接続数で発生。細い回線だとamazonが3本でエラー発生。
									// ネット検索してみたがよい回避策が見つからない。SSL_connectリトライして
									// みたら負荷が下がった段階で成功した。とりあえず少しSleepして10回リトライ。
									// TODO:細い回線でhttps://myspace.com/がこのエラーになり、リトライで成功
									// したが、その後SSL_read()が-1を返して受信できずエラーになった模様。OS
									// はWin8.1実機だった。VirtualBoxのWin8.1+IE11でも発生した。
									LogA("[%u]SSL_connect(%s:%s)エラーSSL_ERROR_SYSCALL,retry..",sock,host,port);
									if( ++retry <10 ){ Sleep(500); goto retry; }
								}
								else LogA("[%u]SSL_connect(%s:%s)=%d,エラー%d",sock,host,port,ret,err);
								if( rp ) rp->grp='?' ,strcpy(rp->msg,"SSL接続できません");
								ssl_ok = FALSE;
							}
						}
						else{
							LogW(L"[%u]SSL_newエラー",sock);
							if( rp ) rp->grp='?' ,strcpy(rp->msg,"サーバー内部エラー");
							ssl_ok = FALSE;
						}
					}
					else LogA("[%u]外部接続:%s:%s",sock,host,port);
					// リクエスト送信
					if( ssl_ok && !*abort ){
						rsp = malloc( sizeof(HTTPGet) + HTTPGET_BUFSIZE );
						if( rsp ){
							DWORD timelimit;
							int len;
							memset( rsp, 0, sizeof(HTTPGet) + HTTPGET_BUFSIZE );
							rsp->bufsize = HTTPGET_BUFSIZE;
							len = _snprintf(rsp->buf,rsp->bufsize,
								"GET /%s HTTP/1.0\r\n"
								"Host: %s\r\n"							// fc2でHostヘッダがないとエラーになる
								"User-Agent: %s\r\n"					// facebookでUser-Agentないと302 move
								"%s"									// Cookie:ヘッダ
								//"Accept-Encoding: identity\r\n"			// 無圧縮
								"Accept-Encoding: gzip,deflate\r\n"		// コンテンツ圧縮
								"Accept-Language: ja,en\r\n"			// nginxの204対策
								"Accept: */*\r\n"						// nginxの204対策
								"Connection: close\r\n"
								"\r\n"
								,path ,host
								,(ua && *ua)? ua :"Mozilla/4.0"
								,cookie? cookie :""
							);
							if( len<0 ){
								LogW(L"[%u]送信バッファ不足",sock);
								len = rsp->bufsize;
							}
							if( sslp ){
								if( SSL_write( sslp, rsp->buf, len )<1 )
									LogW(L"[%u]SSL_writeエラー",sock);
							}
							else{
								if( send( sock, rsp->buf, len, 0 )==SOCKET_ERROR )
									LogW(L"[%u]sendエラー%u",sock,WSAGetLastError());
							}
							rsp->buf[rsp->bufsize-1]='\0';
							LogA("[%u]外部送信:%s",sock,rsp->buf);
							// レスポンス受信4秒待つ
							*rsp->buf = '\0';
							timelimit = timeGetTime() +4000;
							while( !*abort && readable(sock, timelimit - timeGetTime()) ){
								if( *abort ) break;
								if( sslp )
									len = SSL_read( sslp, rsp->buf +rsp->bytes, rsp->bufsize -rsp->bytes );
								else
									len = recv( sock, rsp->buf +rsp->bytes, rsp->bufsize -rsp->bytes, 0 );
								if( len >0 ){
									if( *abort ) break;
									rsp->bytes += len;
									rsp->buf[rsp->bytes] = '\0';
									if( !rsp->body ){
										// ヘッダと本文の区切り空行をさがす
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
										// 空行みつかったらヘッダ解析
										if( rsp->body ){
											rsp->head = rsp->buf;
											while( *rsp->head && !isCRLF(*rsp->head) ) rsp->head++;
											while( isCRLF(*rsp->head) ) *rsp->head++ ='\0';
											if( !rsp->ContentLength ){
												UCHAR* p = strHeaderValue(rsp->head,"Content-Length");
												if( p ){
													UINT n = 0;
													for( ; isdigit(*p); p++ ) n = n*10 + (*p -'0');
													rsp->ContentLength = n; //LogW(L"%uバイトです",n);
												}
												//else LogW(L"Content-Lengthなし");
											}
											if( !rsp->ContentEncoding ){
												UCHAR* p = strHeaderValue(rsp->head,"Content-Encoding");
												if( p ){
													if( strnicmp(p,"deflate",7)==0 ){
														rsp->ContentEncoding = ENC_DEFLATE; //LogW(L"Deflateです");
													}
													else if( strnicmp(p,"gzip",4)==0 ){
														rsp->ContentEncoding = ENC_GZIP; //LogW(L"GZIPです");
													}
													else{
														rsp->ContentEncoding = ENC_OTHER; //LogW(L"その他圧縮");
													}
												}
												//else LogW(L"Content-Encodingなし");
											}
											if( !rsp->ContentType ){
												UCHAR* p = strHeaderValue(rsp->head,"Content-Type");
												if( p ){
													if( strnicmp(p,"text/html",9)==0 ){
														rsp->ContentType = TYPE_HTML; //LogW(L"HTMLです");
													}
													else{
														rsp->ContentType = TYPE_OTHER; //LogW(L"その他形式");
													}
													p = stristr(p,"charset=");
													if( p ){
														p += 8;
														if( *p=='"') p++;
														if( strnicmp(p,"utf-8",5)==0 ){
															rsp->charset = CS_UTF8; //LogW(L"UTF-8です");
														}
														else if( strnicmp(p,"shift_jis",9)==0 ){
															rsp->charset = CS_SJIS; //LogW(L"シフトJISです");
														}
														else if( strnicmp(p,"euc-jp",6)==0 ){
															rsp->charset = CS_EUC; //LogW(L"EUC-JPです");
														}
														else if( strnicmp(p,"iso-2022-jp",11)==0 ){
															rsp->charset = CS_JIS; //LogW(L"ISO-2022-JPです");
														}
														else{
															rsp->charset = CS_OTHER; //LogW(L"その他文字コード");
														}
													}
												}
												//else LogW(L"Content-Typeなし");
											}
										}
									}
									// 受信終了チェック
									if( rsp->ContentLength ){
										// Content-Lengthぶん受信したらおわり
										if( rsp->bytes - (rsp->body - rsp->buf) >= rsp->ContentLength ) break;
									}
									if( rsp->ContentType==TYPE_HTML && !rsp->ContentEncoding ){
										// 非圧縮HTMLなら</head>まであればおわり
										if( stristr(rsp->body,"</head>") ) break;
									}
									if( rsp->bytes >1024*1024*10 ){
										LogW(L"10MBを超える受信データ破棄します");
										break;
									}
									if( rsp->bytes >= rsp->bufsize ){
										// バッファ拡大して受信継続
										size_t newsize = rsp->bufsize * 2;
										HTTPGet* newrsp = malloc( sizeof(HTTPGet) + newsize );
										if( newrsp ){
											int distance = (BYTE*)newrsp - (BYTE*)rsp;
											memset( newrsp, 0, sizeof(HTTPGet) + newsize );
											memcpy( newrsp, rsp, sizeof(HTTPGet) + rsp->bytes );
											if( rsp->body ){
												newrsp->head += distance;
												newrsp->body += distance;
											}
											newrsp->bufsize = newsize;
											free(rsp), rsp=newrsp;
											LogW(L"[%u]バッファ拡大%ubytes",sock,newsize);
										}
										else{
											LogW(L"L%u:malloc(%u)エラー",__LINE__,sizeof(HTTPGet)+newsize);
											break;
										}
									}
								}
								else{
									LogW(L"[%u]%s()=%d",sock,sslp?L"SSL_read":L"recv",len);
									break;
								}
							}
							LogA("[%u]外部受信%ubytes:%s  %s",sock,rsp->bytes,rsp->buf,rsp->head?rsp->head:"");
							if( !*rsp->buf && rp ) rp->grp='?' ,strcpy(rp->msg,"受信タイムアウト");
						}
						else{
							LogW(L"L%u:malloc(%u)エラー",__LINE__,sizeof(HTTPGet)+HTTPGET_BUFSIZE);
							if( rp ) rp->grp='?' ,strcpy(rp->msg,"サーバー内部エラー");
						}
					}
					if( sslp ){
						SSL_shutdown( sslp );
						SSL_free( sslp );
					}
				}
				shutdown( sock, SD_BOTH );
				closesocket( sock );
			}
			else{
				LogA("ホスト%sが見つかりません",host);
				if( rp ) rp->grp='?' ,strcpy(rp->msg,"ホストが見つかりません");
			}
			if( addr ) FreeAddrInfoA( addr );
			free( host );
		}
		else{
			LogW(L"L%u:strdupエラー",__LINE__);
			if( rp ) rp->grp='?' ,strcpy(rp->msg,"サーバー内部エラー");
		}
	}
	else{
		LogA("不正なURL:%s",url);
		if( rp ) rp->grp='E' ,strcpy(rp->msg,"不正なURL");
	}
fin:
	if( rsp ){
		if( *rsp->buf ) return rsp;
		free( rsp );
	}
	return NULL;
}

// zlib伸張
// たとえばhttp://api.jquery.com/jQuery.ajax/やhttp://www.hide10.com/archives/6186は、
// リクエストにAccept-Encodingがない場合、Content-Encoding:gzip で応答が返ってくる。
// とりあえず値が空のAccept-Encodingヘッダをリクエストにつけたら大丈夫になったが、
// それでもgzipで返ってきてしまう場合があった。どうもサイト側にリバースプロキシがあると
// ブラウザでgzip受信したすぐ後にはgzipになってしまうケース？時間が経過したら大丈夫に
// なったが、たしかにブラウザとおなじUser-Agentでリクエストしてるので、Accept-Encoding
// もおなじでないとおかしいが・・やはりgzip対応くらいはすべきか。
// Chrome27は Accept-Encoding: gzip,deflate,sdch
// Fierfox21とIE8は Accept-Encoding: gzip, deflate
// いちおうgzip対応はしておいて、やっぱりAccept-Encodingは空にしておこうかな。
// 空じゃなくてidentityという値が無圧縮という意味らしいのでidentityにしてみよう。
// TODO:コンテンツ圧縮を積極的に使うべきかどうなのか？無圧縮なら</head>まで受信して
// 次に進めるからちょっと速いかも？いやgzip伸長の負荷によるから一概には言えないか…
// [参考サイト]
// サイトの最適化方法 ～ Vary: Accept-Encoding ヘッダーを設定する
// http://kaigai-hosting.com/opt_site-specify-vary-header.php
// HTTPのgzip圧縮コンテントをzlibで展開
// http://blogs.itmedia.co.jp/komata/2011/04/httpgzipzlib-b764.html
// Cでのzlibの伸張
// http://kacl19nrlb99.blog117.fc2.com/blog-entry-84.html
// 3.5 内容コーディング
// http://www.studyinghttp.net/cgi-bin/rfc.cgi?2616#Sec3.5
// 14.3 Accept-Encoding
// http://www.studyinghttp.net/cgi-bin/rfc.cgi?2616#Sec14.3
// 14.11 Content-Encoding
// http://www.studyinghttp.net/cgi-bin/rfc.cgi?2616#Sec14.11
// zlib の使い方
// http://s-yata.jp/docs/zlib/
// 伸長においては，圧縮形式を自動判別することもできます．
// zlibはスタティック.libにするか、ソース組み込みにするか、迷う
// http://dencha.ojaru.jp/programs/pg_filer_04.html
#ifdef _DEBUG
#pragma comment(lib,"zlibd.lib")	// zlibのDebugビルド版。
#else
#pragma comment(lib,"zlib.lib")		// zlibのReleaseビルド版(これをリンクしてJCBookmarkをDebugビルドすると起動時になぜか落ちる)
#endif
#include "zlib.h"
size_t zlibInflate( void* indata, size_t inbytes, void* outdata, size_t outbytes )
{
	z_stream z;
	int status;
	// メモリ管理をライブラリに任せる
	z.zalloc = Z_NULL;
	z.zfree  = Z_NULL;
	z.opaque = Z_NULL;
	// 初期化
	z.next_in  = indata;			// 入力データ
	z.avail_in = inbytes;			// 入力データサイズ
	z.next_out  = outdata;			// 出力バッファ
	z.avail_out = outbytes;			// 出力バッファ残量
	if( inflateInit2(&z, 32+MAX_WBITS) !=Z_OK )
	{
		LogA("inflateInit2エラー(%s)",z.msg?z.msg:"???");
		return 0;
	}
	// 展開
	status = inflate( &z, Z_NO_FLUSH );
	if( status !=Z_OK && status !=Z_STREAM_END )
	{
		LogA("inflateエラー(%s)",z.msg?z.msg:"???");
		inflateEnd(&z);
		return 0;
	}
	outbytes -= z.avail_out;
	// 後始末
	if( inflateEnd(&z) !=Z_OK )
	{
		LogA("inflateEndエラー(%s)",z.msg?z.msg:"???");
		return 0;
	}
	return outbytes;
}

// HTTP圧縮コンテンツ伸長
HTTPGet* HTTPGetContentDecode( HTTPGet* rsp )
{
	if( rsp ){
		// gzip,deflate伸長
		// TODO:301 Moved Permanentlyや302 Foundが(なぜか)伸長エラーになってしまうもよう
		// Accept-Encoding:identityではなかなか圧縮されないので、発生させるにはgzip,deflateに変更する
		if( rsp->ContentEncoding==ENC_GZIP || rsp->ContentEncoding==ENC_DEFLATE ){
			size_t headbytes = rsp->body - rsp->buf;		// HTTPヘッダバイト数
			size_t bodybytes = rsp->bytes - headbytes;		// HTTP本文(圧縮データ)バイト数
			size_t newsize = headbytes + bodybytes * 20;	// 伸長バッファサイズ適当20倍
			HTTPGet* newrsp = malloc( sizeof(HTTPGet) + newsize );
			if( newrsp ){
				int distance = (BYTE*)newrsp - (BYTE*)rsp;
				int bytes;
				memset( newrsp, 0, sizeof(HTTPGet) + newsize );
				memcpy( newrsp, rsp, sizeof(HTTPGet) + headbytes );
				newrsp->head += distance;
				newrsp->body += distance;
				newrsp->bufsize = newsize;
				LogW(L"伸長バッファ確保%ubytes",newsize);
				bytes = zlibInflate( rsp->body, bodybytes, newrsp->body, newsize - headbytes );
				if( bytes )
					LogW(L"伸長[%u]%u->%ubyte(%.1f倍)"
							,rsp->ContentEncoding,bodybytes,bytes,(float)bytes/bodybytes);
				else
					LogW(L"圧縮コンテンツ伸長エラー%u",rsp->ContentEncoding);
				newrsp->bytes = headbytes + bytes;
				newrsp->ContentEncoding = 0;
				free(rsp), rsp=newrsp;
			}
			else LogW(L"L%u:malloc(%u)エラー",__LINE__,sizeof(HTTPGet)+newsize);
		}
	}
	return rsp;
}

// mlang.dll文字コード変換
#include <mlang.h>
typedef HRESULT (APIENTRY *CONVERTINETSTRING)( LPDWORD,DWORD,DWORD,LPCSTR,LPINT,LPBYTE,LPINT );
struct {
	HMODULE				dll;
	CONVERTINETSTRING	Convert;
} mlang = { NULL, NULL };

void HTTPGetHtmlToUTF8( HTTPGet* rsp )
{
	// 本文をUTF-8に変換。文字コードは細かい話は相変わらずカオスのようだ。
	// EUCはMultiByteToWideChar()では20932、ConvertINetString()では51932らしい。
	// とりあえずConvertINetString()で変換しておく。
	if( rsp && rsp->ContentType==TYPE_HTML && mlang.Convert ){
		DWORD CP = 20127;	// 文字コード不明の場合はUS-ASCIIとみなす
		switch( rsp->charset ){
		case CS_UTF8: CP = 65001; break;
		case CS_SJIS: CP = 932;   break;
		case CS_EUC : CP = 51932; break;
		case CS_JIS : CP = 50221; break;
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
			BYTE* tmp = malloc( tmpbytes-- );	// NULL終端文字ぶん減らしておく
			if( tmp ){
				DWORD mode=0;
				HRESULT res;
				memset( tmp, 0, tmpbytes );
				// まずSJIS(932)に変換
				// TODO:ロシア語？がエラーになる
				// http://byaki.net/kartinki/53498-sozdatel-nevedomyh-cifrovyh-mirov-sarel-teron.html
				res = mlang.Convert( &mode, CP, 932, rsp->body, NULL, tmp, &tmpbytes );
				if( res==S_OK ){
					tmp[tmpbytes]='\0';
					tmpbytes = rsp->bufsize - (rsp->body - rsp->buf) -1;
					mode=0;
					// 次にSJISからUTF8(65001)に変換(なぜかEUC→UTF8直変換がエラーになってしまうので)
					res = mlang.Convert( &mode, 932, 65001, tmp, NULL, rsp->body, &tmpbytes );
					if( res==S_OK ){
						rsp->body[tmpbytes]='\0';
						rsp->charset = CS_UTF8; // 管理情報のみ文字コード変更(ヘッダ文字列は無変更)
						// TODO:ログに通信を特定できる識別情報いれる
						LogW(L"文字コード%u->65001変換",CP);
					}
					// TODO:ログに通信を特定できる識別情報いれる
					else LogW(L"ConvertINetString(932->65001)エラー");
				}
				// TODO:ログに通信を特定できる識別情報いれる
				else LogW(L"ConvertINetString(%u->932)エラー",CP);
				free( tmp );
			}
			else LogW(L"L%u:malloc(%u)エラー",__LINE__,tmpbytes);
		}
	}
}

// <meta http-equiv=refresh ..>転送の誤検出を防ぐためHTMLを書き換える。
// http://www.nifty.com/ や facebook で <noscript>タグ内に<meta http-equiv=refresh ..>があり、
// 単純に<meta>を検索しただけでは誤検出(転送じゃないのに転送と判定)になってしまう。<noscript>
// は無視でよいと思うので、<noscript>～</noscript>はあらかじめスペースで塗りつぶす。ついでに
// HTMLコメント<!-- -->や<script>～</script>、<style>～</style>も誤検出の元なので塗りつぶす。
UCHAR* htmlBotherErase( UCHAR* top )
{
	UCHAR *p ,*end;
	// 1.<script>～</script>をスペースで塗りつぶし
	for( p=top; *p; ){
		UCHAR* script = stristr(p,"<script");
		if( script && (script[7]==' ' || script[7]=='>') ){
			end = stristr(script+7,"</script>");
			if( end ){
				UCHAR quote1=0 ,quote2=0;
				// クォート解析
				p = script + 7;
			retry:
				for( ; p<end; p++ ){
					if( *p=='\'' ){ if( quote1 ){ if( *(p-1)!='\\' ) quote1=0; } else quote1=1; }
					else if( *p=='"' ){ if( quote2 ){ if( *(p-1)!='\\' ) quote2=0; } else quote2=1; }
				}
				if( quote1 || quote2 ){
					// </script>がクォートの中
					UCHAR* newend = stristr(end+9,"</script>");
					if( newend ){ end=newend; goto retry; }
					//LogW(L"<script>閉タグが文字列として存在するが新たな閉タグが見つからない構文エラー？");
				}
				p = end + 9 ;
				//LogW(L"<script>%u文字塗りつぶし",p-script);
				memset( script ,' ' ,p-script );
				// 再検索
			}
			else{
				//LogW(L"<script>閉タグがありません");
				*script='\0';
				break;
			}
		}
		else break; // <script>なし
	}
	// 2.HTMLコメント<!-- -->をスペースで塗りつぶし
	for( p=top; *p; ){
		UCHAR* comment = strstr(p,"<!--");
		if( comment ){
			end = strstr(comment+4,"-->");
			if( end ){
				p = end + 3;
				//LogW(L"HTMLコメント%u文字塗りつぶし",p-comment);
				memset( comment ,' ' ,p-comment );
				// 再検索
			}
			else{
				//LogW(L"HTMLコメント閉タグがありません");
				*comment='\0';
				break;
			}
		}
		else break; // コメントなし
	}
	// 3.<noscript>～</noscript>をスペースで塗りつぶし
	for( p=top; *p; ){
		UCHAR* noscript = stristr(p,"<noscript");
		if( noscript && (noscript[9]==' ' || noscript[9]=='>') ){
			end = stristr(noscript+9,"</noscript>");
			if( end ){
				p = end + 11;
				//LogW(L"<noscript>%u文字塗りつぶし",p-noscript);
				memset( noscript ,' ' ,p-noscript );
				// 再検索
			}
			else{
				//LogW(L"<noscript>閉タグがありません");
				*noscript='\0';
				break;
			}
		}
		else break; // <noscript>なし
	}
	// 4.ついでに<style>～</style>もスペースで塗りつぶし
	for( p=top; *p; ){
		UCHAR* style = stristr(p,"<style");
		if( style && (style[6]==' ' || style[6]=='>') ){
			end = stristr(style+6,"</style>");
			if( end ){
				p = end + 8;
				//LogW(L"<style>%u文字塗りつぶし",p-style);
				memset( style ,' ' ,p-style );
				// 再検索
			}
			else{
				//LogW(L"<style>閉タグがありません");
				*style='\0';
				break;
			}
		}
		else break; // <style>なし
	}
	return top;
}

// 文字列先頭からN個まですべてアルファベットなら真
// schemeの判定に使っているがschemeってアルファベットのみでいいんだっけ？
BOOL isalphaN( const UCHAR* p ,size_t N )
{
	const UCHAR* end;
	for( end=p+N; *p && p<end; p++ ){
		if( ('A'<=*p && *p<='Z') || ('a'<=*p && *p<='z') ) continue;
		return FALSE;
	}
	return TRUE;
}
// リダイレクト先URLが相対パスの場合は絶対URLを生成
// mallocして返却するので呼び出し側で解放
UCHAR* absoluteURL( const UCHAR* url ,const UCHAR* base )
{
	const UCHAR* p = url;
	UCHAR* target = strstr(p,"://");
	UCHAR* abs;
	size_t len;
	if( target && p<target && isalphaN(p,target-p) ) return strdup( url ); // もともと絶対URLそのまま
	// 相対URL
	while( *p==':') p++;
	if( p[0]=='/' ){
		// "://"または"//"ではじまる:ベースURLからschemeを補完
		if( p[1]=='/' ){
			target = strchr(base,':');
			if( target && isalphaN(base,target-base) ){
			make: // 絶対URL作成
				len = target - base; // ベースURLのscheme長orホスト名部分まで長orディレクトリパスまで長
				abs = malloc( len + strlen(p) +1 );
				if( abs ){
					memcpy( abs ,base ,len );
					strcpy( abs+len ,p );
					//LogA("absoluteURL:%s (from %s)",abs,url);
					return abs;
				}
				else{
					LogW(L"L%u:malloc(%u)エラー",__LINE__,len+strlen(p)+1);
					return strdup( url );
				}
			}
			else{
				LogW(L"ベースURLが絶対URLではありません");
				return strdup( url );
			}
		}
		// "/"ではじまる:ベースURLからホスト名部分までを補完
		else{
			target = strstr(base,"://");
			if( target && isalphaN(base,target-base) ){
				target += 3;
				while( *target && *target !='/' ) target++;
				goto make;
			}
			else{
				LogW(L"ベースURLが絶対URLではありません");
				return strdup( url );
			}
		}
	}
	// その他:ベースURLのディレクトリパスまで補完
	target = strchr(base,'?');
	if( target ) while( *target !='/' ) target--;
	else target = strrchr(base,'/');
	target++;
	goto make;
}

// URL部品
typedef struct {
	UCHAR* scheme;
	UCHAR* host;
	UCHAR* path;
} URLparts;

// URL文字列からURL部品を抽出
// URL文字列を破壊して部品先頭へのポインタを取得する。
// 部品ポインタはurlcmp()でstrcmp()系に渡すためNULL禁止。
void URLparse( URLparts* part ,UCHAR* url )
{
	part->scheme = url? url :"";
	part->host = strstr(part->scheme,"://");
	if( part->host ){
		part->host[0] = '\0';
		part->host += 3;
		part->path = strchr(part->host,'/');
		if( part->path ){
			part->path[0] = '\0';
			part->path++;
		}
		else part->path = "";
	}
	else part->host = part->path = "";
}
// URL比較
// schemeとホスト名は文字ケース無視でよかったっけ？
// パス文字列は文字ケース区別(するサーバがあるので)。
int urlcmp( const UCHAR* url0 ,const UCHAR* url1 )
{
	int ret = strcmp( url0 ,url1 );
	if( ret ){
		UCHAR* s0 = strdup( url0 );
		UCHAR* s1 = strdup( url1 );
		if( s0 && s1 ){
			URLparts p0 ,p1;
			URLparse( &p0 ,s0 );
			URLparse( &p1 ,s1 );
			if( stricmp( p0.scheme ,p1.scheme )==0 &&
				stricmp( p0.host ,p1.host )==0 &&
				strcmp( p0.path ,p1.path )==0
			) ret = 0; // 同じ
		}
		else LogW(L"L%u:strdupエラー",__LINE__);
		if( s0 ) free( s0 );
		if( s1 ) free( s1 );
	}
	return ret;
}
// 文字列ダブルクォート除去
UCHAR* dequote( UCHAR* top )
{
	if( *top=='"' ){
		UCHAR* end = strchr(++top,'"');
		if( end ) *end='\0';
	}
	return top;
}
// 同じクッキーがあったら削除
Cookie* CookieObsoleteRemove( Cookie* cookie0 ,Cookie* newer )
{
	Cookie* target = cookie0;
	Cookie* prev = NULL;
	while( target ){
		if( stricmp(target->name,newer->name)==0 &&			// NAME文字ケース無視
			stricmp(target->domain,newer->domain)==0 &&		// ドメイン文字ケース無視
			strcmp(target->path,newer->path)==0				// パス完全一致
		){
			if( prev )
				prev->next = target->next;
			else
				cookie0 = target->next;
			free( target );
			return cookie0;
		}
		prev = target;
		target = target->next;
	}
	return cookie0;
}
// HTTPヘッダSet-Cookie:の値を取得解析
// Set-Cookie: NAME=VALUE; expires=DATE; domain=DOMAIN; path=PATH; secure HttpOnly
// DATEはインターネット時刻形式(例: Fri, 06-Dec-2013 16:13:40 GMT)
//   引数	head		HTTPヘッダバッファ
//			cookie0		既存クッキーリスト先頭
//   戻り値				更新クッキーリスト先頭
// TODO:サードパーティクッキーは無視すべき？
// http://d.hatena.ne.jp/R-H/20111101
// http://ascii.jp/elem/000/000/654/654929/
// TODO:Max-Age属性対応すべき？
Cookie* SetCookieParse( const UCHAR* url ,const UCHAR* head ,Cookie* cookie0 )
{
	FILETIME	now;			// 現在時刻
	UCHAR*		host;			// URLホスト名開始位置
	UCHAR*		path=NULL;		// URLパス開始位置
	size_t		hostlen=0;		// URLホスト名長さ
	size_t		pathlen=0;		// URLパス長さ
	UCHAR*		name;			// Set-Cookieヘッダ値開始位置

	host = strstr(url,"//");
	if( host ){
		host += 2;
		path = strchr(host,'/');
		if( path ){
			UCHAR* end = strchr(path,'?');
			if( !end ) end = strchr(path,'#');
			pathlen = end? end - path : strlen(path);
			hostlen = path - host;
		}
		else hostlen = strlen(host);
	}
	if( !hostlen ){
		LogA("不正なURL:%s",url);
		return cookie0;
	}
	if( !pathlen ) path="/" ,pathlen=1;

	GetSystemTimeAsFileTime( &now );

	while( name = strHeaderValue(head,"Set-Cookie") ){
		UCHAR* end = name;
		size_t len;
		while( *end && !isCRLF(*end) ) end++;
		len = end - name;
		if( len ){
			Cookie* cook = malloc( sizeof(Cookie) +len +hostlen +pathlen +2 );
			if( cook ){
				UCHAR* attr;
				memset( cook ,0 ,sizeof(Cookie) );
				// Cookie構造体name変数は可変長文字列
				// +--------------------+----+-------------+----+---------+----+
				// | Set-Cookieヘッダ値 | \0 | URLホスト名 | \0 | URLパス | \0 |
				// +--------------------+----+-------------+----+---------+----+
				memcpy( cook->name ,name ,len );
				cook->name[len]='\0';
				// クッキードメイン初期値＝URLホスト名
				cook->domain = cook->name +len +1;
				memcpy( cook->domain ,host ,hostlen );
				cook->domain[hostlen]='\0';
				cook->domainlen = hostlen;
				// クッキーパス初期値＝URLパス
				cook->path = cook->domain +hostlen +1;
				memcpy( cook->path ,path ,pathlen );
				cook->path[pathlen]='\0';
				cook->pathlen = pathlen;
				// 属性解析
				attr = cook->name;
				while( *attr && *attr !=' ' && *attr !=';' ) attr++; // NAME=VALUEを通過
				if( *attr ){
					*attr++ ='\0';
					while( *attr==' ' || *attr==';' ) attr++;
					while( attr && *attr ){
						// 属性１つ取り出し
						UCHAR* next = strchr(attr,';');
						if( next ){
							while( *next==' ' || *next==';' ) next--; // 末尾の空白除去
							next++ ,*next++ ='\0';
							while( *next==' ' || *next==';' ) next++; // 次の属性の先頭
						}
						else{
							UCHAR* end = attr + strlen(attr) -1;
							while( *end==' ' ) *end-- ='\0'; // 末尾の空白除去
						}
						// 判定
						if( strnicmp(attr,"expires=",8)==0 && attr[8] ){
							UCHAR* p = dequote( attr +8 );
							if( *p ) cook->expire=p;
						}
						else if( strnicmp(attr,"domain=",7)==0 && attr[7] ){
							UCHAR* p = dequote( attr +7 );
							if( *p ) cook->domain=p ,cook->domainlen=strlen(p);
						}
						else if( strnicmp(attr,"path=",5)==0 && attr[5] ){
							UCHAR* p = dequote( attr +5 );
							if( *p ) cook->path=p ,cook->pathlen=strlen(p);
						}
						else if( stricmp(attr,"secure")==0 ){
							cook->secure = 1;
						}
						// 次の属性
						attr = next;
					}
				}
				// VALUE
				cook->value = strchr(cook->name,'=');
				if( cook->value ) *cook->value='\0' ,cook->value++; else cook->value="";
				if( *cook->name ){
					// 同じクッキーがあったら削除
					cookie0 = CookieObsoleteRemove( cookie0 ,cook );
					// 有効期限
					if( cook->expire ){
						SYSTEMTIME st;
						FILETIME ft;
						InternetTimeToSystemTimeA( cook->expire ,&st ,0 );
						SystemTimeToFileTime( &st ,&ft );
						if( *(UINT64*)&ft < *(UINT64*)&now ){
							/*
							LogA("期限切れ:%s=%s; domain=%s; path=%s; expire=%s"
								,cook->name ,cook->value ,cook->domain ,cook->path ,cook->expire);
							*/
							free(cook) ,cook=NULL;
						}
					}
				}
				else free(cook) ,cook=NULL;
				if( cook ){
					/*
					SYSTEMTIME st;
					if( cook->expire ) InternetTimeToSystemTimeA( cook->expire ,&st ,0 );
					LogA("クッキー:%s=%s; domain=%s; path=%s; expire=%04u/%02u/%02u %02u:%02u:%02u; secure=%u"
							,cook->name ,cook->value ,cook->domain ,cook->path
							,cook->expire? st.wYear :0
							,cook->expire? st.wMonth :0
							,cook->expire? st.wDay :0
							,cook->expire? st.wHour :0
							,cook->expire? st.wMinute :0
							,cook->expire? st.wSecond :0
							,cook->secure
					);
					*/
					// リスト先頭に追加
					cook->next = cookie0;
					cookie0 = cook;
				}
			}
			else LogW(L"L%u:malloc(%u)エラー",__LINE__,sizeof(Cookie)+len);
		}
		head = end; // 次のSet-Cookie
	}
	return cookie0;
}
// 指定URLリクエスト用Cookie:ヘッダ(改行つき)を生成する。呼び出し側で解放。
// http://www.studyinghttp.net/cookies#Cookie
UCHAR* CookieRequestHeaderAlloc( Cookie* cookie0 ,const UCHAR* url )
{
	UCHAR* value = NULL;
	UCHAR* urltmp = strdup(url);
	if( urltmp ){
		Cookie* cook;
		URLparts part;
		URLparse( &part ,urltmp );
		// 一巡目：属性が適合するクッキーにフラグ立て
		// ★有効期限内かどうかは判定しない(httpGETsで連続的に呼ばれる間しか保持しないクッキーなので)
		for( cook=cookie0; cook; cook=cook->next ){
			UCHAR* p;
			cook->match = 0;
			// secure属性があったらhttpsのみ
			if( cook->secure && stricmp(part.scheme,"https") ) continue;
			// ドメイン
			p = stristr( part.host ,cook->domain );
			if( p && strlen(p)==cook->domainlen ){
				// パス(part.path は先頭 / なし)
				if( cook->path[0]=='/' ){
					if( cook->path[1]=='\0' ){
						cook->match = 1;
					}
					else if( strncmp( part.path ,cook->path+1 ,cook->pathlen-1 )==0 ){
						cook->match = 1;
					}
				}
				else if( strncmp( part.path ,cook->path ,cook->pathlen )==0 ){
					cook->match = 1;
				}
			}
		}
		free( urltmp );
		// 二巡目：おなじNAMEのクッキーはパス最大長の１つだけ
		// TODO:この↓ページにはおなじNAMEが複数あってもよい(正しい)ように書いてあるが
		// http://www.futomi.com/lecture/cookie/specification.html
		// こっち↓はそうではない、パスが短いのは上書き(で複数にはならない)と書いてある。
		// http://www.studyinghttp.net/cookies#Cookie
		// どっちだよ・・
		for( cook=cookie0; cook; cook=cook->next ){
			if( cook->match ){
				Cookie* comp;
				for( comp=cookie0; comp; comp=comp->next ){
					if( comp->match ){
						if( stricmp(cook->name,comp->name)==0 && cook->pathlen < comp->pathlen ){
							cook->match = 0;
							break;
						}
					}
				}
			}
		}
		// 三巡目：有効クッキー名を連結
		for( cook=cookie0; cook; cook=cook->next ){
			if( cook->match ){
				UCHAR* newval = strjoin( cook->name ,"=" ,cook->value ,value? "; ":"" ,value );
				if( newval ){
					if( value ) free( value );
					value = newval;
				}
			}
		}
	}
	if( value ){
		UCHAR* newval = strjoin( "Cookie: " ,value ,"\r\n" ,0,0 );
		free( value );
		value = newval;
	}
	return value;
}
// クッキーリスト全破棄
void CookieDestroy( Cookie* cookie )
{
	while( cookie ){
		Cookie* next = cookie->next;
		free( cookie );
		cookie = next;
	}
}
// httpGET()の結果が転送の場合はさらにhttpGET()して返却
HTTPGet* httpGETs( const UCHAR* url0 ,const UCHAR* ua ,const UCHAR* abort ,PokeReport* rp )
{
	HTTPGet* rsp = httpGET( url0 ,ua ,abort ,rp ,0 );
	Cookie* cookie = NULL;
	UCHAR* newurl = NULL;
	UINT hop = 0;
	if( rsp ){
	retry:
		if( *abort ) goto fin;
		if( hop++ >9 ){
			LogW(L"転送回数が多すぎます");
			if( rp ) rp->grp='?' ,strcpy(rp->msg,"転送が多すぎます");
			goto fin;
		}
		rsp = HTTPGetContentDecode( rsp );
		// HTTP/1.x 200 OK
		if( rsp->bytes >12 && rsp->buf[8]==' ' ){
			UCHAR* code = rsp->buf +9;	// 応答コードテキスト("200 OK"など)
			switch( code[0] ){
			case '2': // 成功
				// TODO:YouTubeの動画URLは動画が消されてても200 OKになってしまう。本文を解析しないと不明。
				// 実装したとしてもYouTubeの仕様変更に振り回されるだろう・・。
				// TODO:gihyo.jpの記事で<title>が取得できない問題が発生した時、ここでrsp->bodyを裁断してる
				// 事が原因だった。<meta>より後に<title>があり、<meta>解析でrsp->bodyを裁断したため<title>
				// がなくなってしまった。とりあえず<meta>の処理でrsp->body裁断をピンポイントで元に戻すよう
				// にしたら大丈夫になったけど、本当は最初から改変しないような処理にしないと怖い…。
				// TODO:Set-Cookieはヘッダだけじゃなくて<meta http-equiv="set-cookie" content="...">も？
				// http://www.tohoho-web.com/wwwcook.htm
				// http://q.hatena.ne.jp/1326164005
				// TODO:みんくちゃんねるの個別記事URLは記事がなくなってても 200 が返ってくる。判別不能。
				if( rsp->ContentType==TYPE_HTML ){
					// <meta http-equiv="refresh" content="0;URL=新URL"> 方式の転送。時事ドットコムや@ITの
					// 記事、他でもしばしば使われている。
					UCHAR* body ,*meta;
					HTTPGetHtmlToUTF8( rsp );
					body = htmlBotherErase( rsp->body ); // rsp->body破壊だがanalyze()には関係ないので戻さない
					while( meta = stristr(body,"<meta ") ){
						UCHAR* endtag = strchr(meta,'>');
						if( endtag ){
							*endtag='\0'; // rsp->body一時破壊
							if( stristr(meta,"http-equiv=") && stristr(meta,"refresh") ){
								UCHAR* content = stristr(meta,"content=");
								if( content ){
									content += 8;
									// 最初に出てくる数字かセミコロンを探して
									for( ; *content; content++ ) if( isdigit(*content) || *content==';' ) break;
									if( *content=='0' ){ // 数字(秒数)がゼロなら
										UCHAR* url = stristr(content,"URL=");
										if( url ){
											UCHAR* end ,ch ,*abs;
											url += 4;
											for( end=url; *end; end++ ) if( *end==' ' || *end=='"' || *end=='\'' ) break;
											ch=*end ,*end='\0'; // rsp->body一時破壊
											//LogA("refresh URL=%s",url);
											abs = absoluteURL( url ,newurl? newurl :url0 );
											*end=ch; // 元に戻す
											if( abs ){
												HTTPGet* newrsp;
												UCHAR* value;
												cookie = SetCookieParse( newurl? newurl :url0 ,rsp->head ,cookie );
												value = CookieRequestHeaderAlloc( cookie ,abs );
												newrsp = httpGET( abs ,ua ,abort ,rp ,value );
												if( value ) free( value );
												if( newurl ) free( newurl );
												newurl = abs;
												if( newrsp ){
													free(rsp), rsp=newrsp;
													goto retry;
												}
											}
											else{ if( rp ) rp->grp='?' ,strcpy(rp->msg,"サーバー内部エラー"); }
											*endtag='>'; // 元に戻す
											goto fin;
										}
									}
								}
							}
							*endtag='>'; // 元に戻す
							body = endtag +1; // 次
						}
						else break;
					}
				}
				// 転送先URL(newurl)が最初のURLと同じ場合は転送されなかったのと同等とみなす。
				// http://www.ec-current.com/ が302でクッキー発行して元のURLに戻ってくるので、
				// それを転送とみなさないため。
				if( rp ){
					if( newurl && urlcmp(newurl,url0) )
						rp->grp='!';
					else
						rp->grp='O' ,free(newurl) ,newurl=NULL;
				}
				break;
			case '3': // 転送
				// http://www.ec-current.com/ は匿名閲覧でもクッキーを使っているようで、Cookie: なしで
				// アクセスすると302で飛ばされ、クッキー発行してまた302で元のURLに戻すという仕様のもよう。
				// クッキー有効クライアントは戻ってきた時のURLは最初とおなじだが、クッキー無効クライアントは
				// top.aspx?cookie=no とかパラメータついており初回URLと同じではない。技術的には転送だが全体
				// としては転送じゃないので、転送と判定しないため、クッキー認識とURL比較を行う。
				// gihyo.jpの記事(例:http://gihyo.jp/dev/clip/01/orangenews/vol62/0005)も匿名閲覧でクッキー
				// 発行301飛ばしがあるようだ。しかもSet-Cookie:ヘッダが複数。
				// TODO:Coccoc は Location: http://localhost/ を返してくるけど、ポート番号なくてもいいの？
				// http://localhost:4474/ じゃないの？でもブラウザはちゃんとポート4474にアクセスしている謎…。
				// localhost通信だからキャプチャできないし…
				// TODO:307,308が新設？
				// 新たなHTTPステータスコード「308」とは？
				// http://gigazine.net/news/20140220-http-308/
				{
					UCHAR* url = strHeaderValue(rsp->head,"Location");
					if( url ){
						UCHAR* end ,ch ,*abs;
						for( end=url; *end && !isCRLF(*end); end++ );
						ch=*end ,*end='\0'; // rsp->head一時破壊
						//LogA("location URL=%s",url);
						abs = absoluteURL( url ,newurl? newurl :url0 );
						*end=ch; // 元に戻す
						if( abs ){
							HTTPGet* newrsp;
							UCHAR* value;
							cookie = SetCookieParse( newurl? newurl :url0 ,rsp->head ,cookie );
							value = CookieRequestHeaderAlloc( cookie ,abs );
							newrsp = httpGET( abs ,ua ,abort ,rp ,value );
							if( value ) free( value );
							if( newurl ) free( newurl );
							newurl = abs;
							if( newrsp ){
								free(rsp), rsp=newrsp;
								goto retry;
							}
						}
						else{ if( rp ) rp->grp='?' ,strcpy(rp->msg,"サーバー内部エラー"); }
						goto fin;
					}
					else LogW(L"3xxリダイレクト応答でLocationヘッダがありません");
				}
				if( rp ) rp->grp='!';
				break;
			case '4': // クライアントエラー
				// YouTubeがアクセスしすぎるとすべて 429 Too Many Requests で閲覧できなくなるが、しば
				// らくすると復活する。のでリンク切れではない。4xx系でリンク切れ死亡と断定してよいコードは、
				// 404,410くらいか？他のは(死亡アイコンでなく)エラーアイコン。
				switch( code[1] ){
				case '0':
					switch( code[2]) {
					case '4':if( rp ) rp->grp='D'; break;	// 404 Not Found =死亡
					default: if( rp ) rp->grp='E';			// 40x =エラー
					}
					break;
				case '1':
					switch( code[2]) {
					case '0':if( rp ) rp->grp='D'; break;	// 410 Gone =死亡
					default: if( rp ) rp->grp='E';			// 41x =エラー
					}
					break;
				default: if( rp ) rp->grp='E';				// 4xx =エラー
				}
				break;
			case '5': // サーバーエラー
				if( rp ) rp->grp='E'; // Error
				break;
			//case '1': // 情報(HTTP/1.1以降)
			default:
				if( rp ) rp->grp='?';
			}
			if( rp ){
				strncpy( rp->msg ,code ,sizeof(rp->msg) );
				rp->msg[sizeof(rp->msg)-1]='\0';
			}
		}
		else{ if( rp ) rp->grp='?' ,strcpy(rp->msg,"不明なHTTP応答"); }
	}
fin:
	CookieDestroy( cookie );
	if( rp ) rp->newurl = newurl;
	else if( newurl ) free( newurl );
	return rsp;
}
// 指定URL死活確認を行うスレッド関数
// クライアントからの要求 POST /:poke HTTP/1.x で開始され、
// 本文の1行1URLの
// - URLに接続しGETリクエストを送って応答を確認する。
// - 名前解決エラー、接続タイムアウトなどはその旨の短文テキストを生成する。
// - クライアントへの応答は基本「200 OK」で本文にJSON形式で調査結果を記載する。
// - 転送されたら転送先を確認
//   リダイレクト手法まとめ
//   http://likealunatic.jp/2007/10/21_redirect.php
// TODO:HTTP以外のスキーム(ftp:等)
// TODO:JavaScriptを使った転送の解析は自力では難しいが対応する手立てはあるのか…
// PhantomJSという6MB程度のJavaScript+WebKitアプリがあってCUIでURLをレンダリングして
// タイトル取得できてHTTPSも対応している。これを組み込めればいけるがライセンス要調査。
typedef struct PokeCTX {
	struct PokeCTX* next;	// 単方向リスト
	UCHAR*		url;		// in URL
	UCHAR*		userAgent;	// in リクエストUserAgent
	UCHAR*		pAbort;		// in 中断フラグ
	HANDLE		thread;		// in スレッドハンドル
	//UCHAR*		upper;		// out URLが死んでいた時の上位パスURL
	PokeReport	repo;		// out 死活結果
} PokeCTX;
unsigned __stdcall poke( void* tp )
{
	PokeCTX* ctx = tp;
	UCHAR* hash = strchr(ctx->url,'#');
	HTTPGet* rsp;
	// URLの#以降を除去
	if( hash ) *hash = '\0';
	rsp = httpGETs( ctx->url ,ctx->userAgent ,ctx->pAbort ,&(ctx->repo) );
	// #復活
	if( hash ){
		*hash = '#';
		// 新URLに旧URLの#以降を付加
		if( ctx->repo.newurl ){
			UCHAR* newurl = strjoin( ctx->repo.newurl ,hash ,0,0,0 );
			if( newurl ){
				free( ctx->repo.newurl );
				ctx->repo.newurl = newurl;
			}
		}
	}
	if( rsp ) free( rsp );
	/*
	// TODO:死亡(404等)で転送URLもなかった場合の上位パス確認
	// http://www.hirosawatadashi.com/index.html が 404 Not Found だが 200 とおなじ正しいHTML
	// が返ってくる。応答1行目が、index.html なしなら 200、index.html つけると 404 になるだけ
	// で、コンテンツは同じトップページのHTMLが返ってくる。リダイレクトじゃなくURLが変わらない
	// のでブラウザ上はそのURLで正しく表示されているように見えてしまう。というか不正パスはなん
	// でも xxx.jpg でも1行目は 404 で以降はトップコンテンツHTMLが返ってくる挙動のようだ。
	// 正しいURLは 200 が返ってくるからわかるし、ブラウザ上は問題ないし、なるほどリダイレクト
	// せずこういう応答するサーバーもあるのか。しかし判定処理どうしよう・・トップページを取得
	// して比較するとかしないと判定できない？もしトップページと同じだったら 200 OK に変更して
	// 返却する？でもそれもよろしくないような・・うーむ。
	// 他にも、以下URLは404だが、パッと見は正常ぽいコンテンツが返ってくる。
	// http://www.buseireann.ie/site/home/
	// http://www.ns.nl/en/home
	// http://www.flatfoot56.com/main.html →上位にアクセスすると転送される
	if( ctx->repo.grp=='D' && !ctx->repo.newurl ){
		UCHAR* upper = strdup( ctx->url );
		if( upper ){
			UCHAR* path = strstr(upper,"://");		// URLのパス開始点
			if( path ) path = strchr(path+3,'/');
			while( path ){							// 上位パスがあるだけループ
				UCHAR* sl = strrchr(path,'/');
				if( sl ){
					if( sl[1] ) sl[1]='\0';			// パスがファイル名
					else{							// パスがディレクトリ
						if( sl==path ) break;
						*sl ='\0';
						sl = strrchr(path,'/');
						if( sl ) sl[1]='\0';
					}
					if( strcmp( ctx->url ,upper ) ){
						PokeReport repo = {'?',"不明な処理結果です",NULL};
						HTTPGet* rsp = httpGETs( upper ,ctx->userAgent ,ctx->pAbort ,&repo );
						if( rsp ){
							free( rsp );
							if( repo.grp=='O' || repo.grp=='!' ){
								if( repo.newurl ){
									ctx->upper = strdup( repo.newurl );
									free( repo.newurl );
								}
								else ctx->upper = strdup( upper );
								break;
							}
							else if( repo.newurl ) free( repo.newurl );
						}
					}
					else break;
				}
				else break;
			}
			free( upper );
		}
	}
	*/
	_endthreadex(0);
	return 0;
}
PokeCTX* PokeStart( UCHAR* url ,UCHAR* userAgent ,UCHAR* pAbort )
{
	PokeCTX* ctx = malloc( sizeof(PokeCTX) );
	if( ctx ){
		ctx->next			= NULL;
		ctx->url			= url;
		ctx->userAgent		= userAgent;
		ctx->pAbort			= pAbort;
		//ctx->upper			= NULL;
		ctx->repo.grp		= '?';
		strcpy(ctx->repo.msg,"不明な処理結果です");
		ctx->repo.newurl	= NULL;
		ctx->thread			= (HANDLE)_beginthreadex( NULL,0 ,poke ,(void*)ctx ,0,NULL );
	}
	else LogW(L"L%u:malloc(%u)エラー",__LINE__,sizeof(PokeCTX));
	return ctx;
}
unsigned __stdcall poker( void* tp )
{
	TClient*	cp		= tp;
	UCHAR*		url		= cp->req.body;
	UCHAR*		bp		= url;
	PokeCTX*	ctx0	= NULL;
	PokeCTX*	ctxN	= NULL;
	PokeCTX*	ctx;
	UINT		count	= 0;
	// リクエストボディ1行1URL取得スレッド生成
	while( *bp ){
		if( isCRLF(*bp) ){
			*bp++ = '\0';				// req.body破壊
			while( isCRLF(*bp) ) bp++;	// 空行無視
			if( *url==':' ) url++;		// 空URL防止用行頭':'スキップ
			ctx = PokeStart( url ,cp->req.UserAgent ,&(cp->abort) );
			if( ctx ){
				// 単方向リスト末尾
				if( ctx0 ){
					ctxN->next = ctx;
					ctxN = ctx;
				}
				else ctx0 = ctxN = ctx;
				LogA("[%u]URL%u:%s",Num(cp),count++,url);
			}
			url = bp;
		}
		else bp++;
	}
	// スレッド待機
	for( ctx=ctx0; ctx; ctx=ctx->next ){
		WaitForSingleObject( ctx->thread ,INFINITE );
		CloseHandle( ctx->thread );
	}
	// レスポンス作成
	if( !cp->abort ){
		BufferSend( &(cp->rsp.body) ,"[" ,1 );
		for( ctx=ctx0 ,count=0; ctx; ctx=ctx->next ,count++ ){
			PokeReport* rp = &(ctx->repo);
			LogA("[%u]URL%u:%c,%s,%s",Num(cp),count,rp->grp,rp->msg,rp->newurl?rp->newurl:"");
			BufferSendf( &(cp->rsp.body)
					//,"%s{\"grp\":\"%c\",\"msg\":\"%s\",\"url\":\"%s\",\"upper\":\"%s\"}"
					,"%s{\"grp\":\"%c\",\"msg\":\"%s\",\"url\":\"%s\"}"
					,(ctx==ctx0)? "":","
					,rp->grp ,rp->msg ,rp->newurl? rp->newurl :"" //,ctx->upper? ctx->upper :""
			);
		}
		BufferSend( &(cp->rsp.body) ,"]" ,1 );
		BufferSendf( &(cp->rsp.head)
				,"HTTP/1.0 200 OK\r\n"
				"Content-Type: application/json; charset=utf-8\r\n"
				"Content-Length: %u\r\n"
				,cp->rsp.body.bytes
		);
	}
	// 解放
	for( ctx=ctx0; ctx; ctxN=ctx->next ,free(ctx) ,ctx=ctxN ){
		if( ctx->repo.newurl ) free( ctx->repo.newurl );
	}
	// 終了
	PostMessage( MainForm ,WM_THREADFIN ,(WPARAM)cp->sock ,0 );
	_endthreadex(0);
	return 0;
}
// 指定URLのタイトルとか解析するスレッド関数
// クライアントからの要求 POST /:analyze HTTP/1.x で開始され、
// 本文の1行1URLのタイトルとfaviconを解析し、JSON形式の応答文字列を生成する。
//		[{"title":"タイトル","icon":"URL"},{...}]
// TODO:URLがamazonアダルトコンテンツだと「警告：」というページタイトルになる。
// 「18歳以上」をクリックするとクッキーが発行されて、そのクッキーを送信すれば
// 目的のタイトルを取得できる仕組み？JavaScriptでは他ドメインのクッキーは取得
// できないっぽいので、やるとしたらサーバ側で自動で「18歳以上」をクリックする
// 動作をやってしまうことか…。ブラウザが保持してるamazonクッキーを取得する手
// はあるのかな？でもそんなことするアプリはセキュリティ的にまずそうで厳しいか。
// しかしブラウザで表示してたタイトルを取得できないのはブックマークとしては
// イマイチなのも確か…。なにかいい手はないものか…。
// ブラウザのアドオンを使う手もあるか？
typedef struct AnalyCTX {
	struct AnalyCTX* next;	// 単方向リスト
	UCHAR*		url;		// in URL
	UCHAR*		userAgent;	// in リクエストUserAgent
	UCHAR*		pAbort;		// in 中断フラグ
	HANDLE		thread;		// in スレッドハンドル
	UCHAR*		pageTitle;	// out ページタイトル
	UCHAR*		favicon;	// out ページファビコン
	PokeReport	repo;		// out 死活結果
} AnalyCTX;
unsigned __stdcall analyze( void* tp )
{
	AnalyCTX* ctx = tp;
	UCHAR* hash = strchr(ctx->url,'#');
	HTTPGet* rsp;
	// URLの#以降を除去
	if( hash ) *hash = '\0';
	rsp = httpGETs( ctx->url ,ctx->userAgent ,ctx->pAbort ,&(ctx->repo) );
	// #復活
	if( hash ){
		*hash = '#';
		// 新URLに旧URLの#以降を付加
		if( ctx->repo.newurl ){
			UCHAR* newurl = strjoin( ctx->repo.newurl ,hash ,0,0,0 );
			if( newurl ){
				free( ctx->repo.newurl );
				ctx->repo.newurl = newurl;
			}
		}
	}
	// タイトル,favicon取得
	if( rsp ){
		UCHAR* title=NULL, *icon=NULL;
		if( *ctx->pAbort ) goto fin;
		if( rsp->ContentType==TYPE_HTML ){
			UCHAR* begin ,*end;
			HTTPGetHtmlToUTF8( rsp );
			// タイトル取得
			begin = stristr(rsp->body,"<title");
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
				else LogA("</title>が見つかりません(%s)",ctx->url);
			}
			else LogA("<title>が見つかりません(%s)",ctx->url);
			// favicon取得まず<link rel=icon href="xxx">をさがす
			begin = rsp->body;
			while( begin=stristr(begin,"<link") ){
				begin += 5;
				end = strchr(begin,'>');
				if( end ){
					UCHAR* rel = stristr(begin," rel=");
					if( rel ){
						rel += 5;
						if( rel < end ){
							if( strnicmp(rel,"\"shortcut icon\"",15)==0
								|| strnicmp(rel,"\"icon\"",6)==0
								|| strnicmp(rel,"icon ",5)==0 ){
								UCHAR* href = stristr(begin," href=");
								if( href ){
									href += 6;
									if( href < end ){
										if( *href=='"' ){
											UCHAR* endquote = strchr(++href,'"');
											if( endquote )
												icon = strndup( href, endquote - href );
										}
										else{
											UCHAR* space = strchr(href,' ');
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
			if( icon ){
				UCHAR* url = NULL;
				if( strncmp(icon,"//",2)==0 ){
					// スキームが省略された完全URL
					// はてなhotentryの<link>タグが「href="//b.hatena.ne.jp/favicon.ico"」となっている。
					// 相対URLでなく完全URLとみなすべきもののようだ。先頭のhttp(s):を省略して「//」で
					// 始まってもいいらしい。この場合はスキームを補完した完全URLを生成する。
					UCHAR* slash = strstr(ctx->url,"://");
					if( slash ){
						slash++;
						*slash='\0';
						url = strjoin( ctx->url ,icon ,0,0,0 );
						*slash='/';
					}
				}
				else if( !strstr(icon,"://") ){
					// 相対URL
					UCHAR* host = strstr(ctx->url,"://");
					if( host ){
						host += 3;
						if( *icon=='/' ){
							// href="/img/favicon.ico"
							UCHAR* slash = strchr(host,'/');
							if( slash ) *slash = '\0';
							url = strjoin( ctx->url ,icon ,0,0,0 );
							if( slash ) *slash = '/';
						}
						else{
							// href="img/favicon.ico"
							UCHAR* slash = strrchr(host,'/');
							if( slash ) *slash = '\0';
							url = strjoin( ctx->url ,"/" ,icon ,0,0 );
							if( slash ) *slash = '/';
						}
					}
				}
				if( url ) free(icon), icon=url;
			}
			// URL取得確認
			if( icon ){
				BOOL success = FALSE;
				HTTPGet* tmp = httpGET( icon ,ctx->userAgent ,ctx->pAbort ,0,0 );
				if( tmp ){
					// HTTP/1.x 200 OK
					// あまり厳密チェックせず2xxか3xxならオッケーとする
					if( tmp->bytes >12 &&( tmp->buf[9]=='2' || tmp->buf[9]=='3') ) success=TRUE;
					free( tmp );
				}
				if( !success ) free(icon), icon=NULL;
			}
			// <link>がなかったらhttp(s)://host/favicon.icoがあるか確認
			if( !icon ){
				UCHAR* host = strstr(ctx->url,"://");
				UCHAR* slash;
				if( host ){
					host += 3;
					slash = strchr(host,'/');
					if( slash ) *slash = '\0';
					icon = strjoin( ctx->url ,"/favicon.ico" ,0,0,0 );
					if( icon ){
						BOOL success = FALSE;
						HTTPGet* tmp = httpGET( icon ,ctx->userAgent ,ctx->pAbort ,0,0 );
						if( tmp ){
							if( tmp->bytes >12 && strnicmp(tmp->buf+8," 200",4)==0 ) // HTTP/1.x 200 OK
								if( tmp->ContentType !=TYPE_HTML ) // text/html 除外
									success = TRUE;
							free( tmp );
						}
						if( !success ) free(icon), icon=NULL;
					}
					if( slash ) *slash = '/';
				}
			}
		}
		ctx->pageTitle = title;
		ctx->favicon = icon;
	fin:free( rsp );
	}
	_endthreadex(0);
	return 0;
}
AnalyCTX* AnalyStart( UCHAR* url ,UCHAR* userAgent ,UCHAR* pAbort )
{
	AnalyCTX* ctx = malloc( sizeof(AnalyCTX) );
	if( ctx ){
		ctx->next			= NULL;
		ctx->url			= url;
		ctx->userAgent		= userAgent;
		ctx->pAbort			= pAbort;
		ctx->pageTitle		= NULL;
		ctx->favicon		= NULL;
		ctx->repo.grp		= '?';
		strcpy(ctx->repo.msg,"不明な処理結果です");
		ctx->repo.newurl	= NULL;
		ctx->thread			= (HANDLE)_beginthreadex( NULL,0 ,analyze ,(void*)ctx ,0,NULL );
	}
	else LogW(L"L%u:malloc(%u)エラー",__LINE__,sizeof(AnalyCTX));
	return ctx;
}
unsigned __stdcall analyzer( void* tp )
{
	TClient*	cp		= tp;
	UCHAR*		url		= cp->req.body;
	UCHAR*		bp		= url;
	AnalyCTX*	ctx0	= NULL;
	AnalyCTX*	ctxN	= NULL;
	AnalyCTX*	ctx;
	UINT		count	= 0;
	// リクエストボディ1行1URL取得スレッド生成
	while( *bp ){
		if( isCRLF(*bp) ){
			*bp++ = '\0';				// req.body破壊
			while( isCRLF(*bp) ) bp++;	// 空行無視
			if( *url==':' ) url++;		// 空URL防止用行頭':'スキップ
			ctx = AnalyStart( url ,cp->req.UserAgent ,&(cp->abort) );
			if( ctx ){
				// 単方向リスト末尾
				if( ctx0 ){
					ctxN->next = ctx;
					ctxN = ctx;
				}
				else ctx0 = ctxN = ctx;
				LogA("[%u]URL%u:%s",Num(cp),count++,url);
			}
			url = bp;
		}
		else bp++;
	}
	// スレッド待機
	for( ctx=ctx0; ctx; ctx=ctx->next ){
		WaitForSingleObject( ctx->thread ,INFINITE );
		CloseHandle( ctx->thread );
	}
	// レスポンス作成
	if( !cp->abort ){
		BufferSend( &(cp->rsp.body) ,"[" ,1 );
		for( ctx=ctx0 ,count=0; ctx; ctx=ctx->next ,count++ ){
			PokeReport* rp = &(ctx->repo);
			LogA("[%u]URL%u:%s,%s",Num(cp),count,ctx->pageTitle?ctx->pageTitle:"",ctx->favicon?ctx->favicon:"");
			BufferSendf( &(cp->rsp.body)
					,"%s{\"title\":\"%s\",\"icon\":\"%s\",\"grp\":\"%c\",\"msg\":\"%s\"}"
					,(ctx==ctx0)? "":","
					,ctx->pageTitle? ctx->pageTitle :""
					,ctx->favicon? ctx->favicon :""
					,rp->grp ,rp->msg
			);
		}
		BufferSend( &(cp->rsp.body) ,"]" ,1 );
		BufferSendf( &(cp->rsp.head)
				,"HTTP/1.0 200 OK\r\n"
				"Content-Type: application/json; charset=utf-8\r\n"
				"Content-Length: %u\r\n"
				,cp->rsp.body.bytes
		);
	}
	// 解放
	for( ctx=ctx0; ctx; ctxN=ctx->next ,free(ctx) ,ctx=ctxN ){
		if( ctx->pageTitle ) free( ctx->pageTitle );
		if( ctx->favicon ) free( ctx->favicon );
		if( ctx->repo.newurl ) free( ctx->repo.newurl );
	}
	// 終了
	PostMessage( MainForm ,WM_THREADFIN ,(WPARAM)cp->sock ,0 );
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
WCHAR* FirefoxPlacesPathAlloc( void )
{
	#define PROFILES_INI L"%APPDATA%\\Mozilla\\Firefox\\profiles.ini"
	#define PLACES_SQLITE L"places.sqlite"
	WCHAR* places = NULL;
	// 環境変数展開
	WCHAR* profiles = ExpandEnvironmentStringsAlloc( PROFILES_INI );
	if( profiles ){
		WCHAR path[MAX_PATH+1];
		GetPrivateProfileStringW(L"Profile0",L"Path",L"",path,sizeof(path)/sizeof(WCHAR),profiles);
		if( *path ){
			WCHAR* sep = wcsrchr( profiles, L'\\' );
			if( sep ){
				// 末尾"\\profiles.ini"を削除
				*sep = L'\0';
				// profiles\path\places.sqlite
				places = wcsjoin( profiles, L"\\", path, L"\\", PLACES_SQLITE );
			}
			else LogW(L"不正パス？:%s",profiles);
		}
		else LogW(L"Firefoxプロファイルパスがわかりません");
		free( profiles );
	}

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
UINT FirefoxJSON( sqlite3* db, FILE* fp, int parent, UINT* nextid, UINT depth, const UCHAR* view )
{
	sqlite3_stmt* bookmarks;
	UCHAR* moz_bookmarks = "select id,type,fk,title,dateAdded from moz_bookmarks where parent=? order by position";
	UINT count=0;
	int rc;

	sqlite3_prepare( db, moz_bookmarks, -1, &bookmarks, 0 );
	sqlite3_bind_int( bookmarks, 1, parent );

sqlite3_step:
	rc = sqlite3_step( bookmarks );
	if( sqlite3_data_count( bookmarks ) ){
		if( rc==SQLITE_DONE || rc==SQLITE_ROW ){
			int type = sqlite3_column_int( bookmarks, 1 );
			const UCHAR* title = sqlite3_column_text( bookmarks, 3 );
			const UCHAR* dateAdded = sqlite3_column_text( bookmarks, 4 );
			UINT n;
			if( !dateAdded ) dateAdded = "";
			if( type==1 ){
				// ブックマーク
				int fk = sqlite3_column_int( bookmarks, 2 );
				sqlite3_stmt* places;
				UCHAR* moz_places = "select url,favicon_id from moz_places where id=?";
				int rc;
				sqlite3_prepare( db, moz_places, -1, &places, 0 );
				sqlite3_bind_int( places, 1, fk );
				rc = sqlite3_step( places );
				if( sqlite3_data_count( places ) ){
					if( rc==SQLITE_DONE || rc==SQLITE_ROW ){
						const UCHAR* url="";
						const UCHAR* favicon_url="";
						// faviconURL取得
						sqlite3_stmt* favicons;
						UCHAR* moz_favicons = "select url from moz_favicons where id=?";
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
							UCHAR* titleJSON = NULL;
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
				UCHAR* titleJSON = NULL;
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
WCHAR* ChromeBookmarksPathAlloc( void )
{
	OSVERSIONINFOA os;
	WCHAR* path = L"%USERPROFILE%\\Local Settings\\Application Data\\Google\\Chrome\\User Data\\Default\\Bookmarks";
	// [WindowsのOS判定]
	// http://cherrynoyakata.web.fc2.com/sprogram_1_3.htm
	// http://www.westbrook.jp/Tips/Win/OSVersion.html
	memset( &os, 0, sizeof(os) );
	os.dwOSVersionInfoSize = sizeof(os);
	GetVersionExA( &os );
	if( os.dwMajorVersion>=6 ){
		// Vista以降
		path = L"%USERPROFILE%\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Bookmarks";
	}
	// 環境変数展開
	return ExpandEnvironmentStringsAlloc( path );
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
UINT ChromeFaviconJSON( sqlite3* db, FILE* fp, const UCHAR* view )
{
	sqlite3_stmt* icon_mapping;
	sqlite3_stmt* favicons;
	UCHAR* select_icon_mapping = "select page_url,icon_id from icon_mapping";
	UCHAR* select_favicons = "select url from favicons where id=?";
	UINT count=0;
	int rc;

	sqlite3_prepare( db, select_icon_mapping, -1, &icon_mapping, 0 );
	sqlite3_prepare( db, select_favicons, -1, &favicons, 0 );

  sqlite3_step:
	rc = sqlite3_step( icon_mapping );
	if( sqlite3_data_count( icon_mapping ) ){
		if( rc==SQLITE_DONE || rc==SQLITE_ROW ){
			const UCHAR* page_url = sqlite3_column_text( icon_mapping, 0 );
			int icon_id = sqlite3_column_int( icon_mapping, 1 );
			if( page_url && *page_url ){
				int rc;
				sqlite3_bind_int( favicons, 1, icon_id );
				rc = sqlite3_step( favicons );
				if( sqlite3_data_count( favicons ) ){
					if( rc==SQLITE_DONE || rc==SQLITE_ROW ){
						const UCHAR* url = sqlite3_column_text( favicons, 0 );
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
// CAB圧縮・展開(キャビネットAPI)
// http://eternalwindows.jp/installer/cabinet/cabinet00.html
// http://msdn.microsoft.com/en-us/library/bb432265%28v=vs.85%29.aspx
#pragma comment(lib,"cabinet.lib")
#include <shlobj.h>
#include <fci.h>
#include <fdi.h>
#include <io.h>
#include <fcntl.h>
// FNFCIFILEPLACED macro
// http://msdn.microsoft.com/en-us/library/ff797934%28v=vs.85%29.aspx
int DIAMONDAPI fciFilePlaced( PCCAB pccab, char* pszFile, long cbFile, BOOL fContinuation, void* pv )
{
	return 0;
}
// FNFCIALLOC macro
// http://msdn.microsoft.com/en-us/library/ff797931%28v=vs.85%29.aspx
void* DIAMONDAPI cabAlloc( ULONG cb )
{
	void* p = malloc( cb );
	if( p ) memset( p, 0, cb );
	else LogW(L"L%u:malloc(%u)エラー",__LINE__,cb);
	return p;
}
// FNFCIFREE macro
// http://msdn.microsoft.com/en-us/library/ff797935%28v=vs.85%29.aspx
void DIAMONDAPI cabFree( void* memory )
{
	free( memory );
}
// FNFCIOPEN macro
// http://msdn.microsoft.com/en-us/library/ff797939%28v=vs.85%29.aspx
// FCI/FDIはUNICODE未対応らしいので、UTF-8で受け渡して無理やりUNICODE対応
int DIAMONDAPI fciOpen( char* pszFile, int oflag, int pmode, int* err, void* pv )
{
	int fd = -1;
	WCHAR* wpath = MultiByteToWideCharAlloc( pszFile, CP_UTF8 );
	if( wpath ){
		DWORD dwDesiredAccess=0;
		DWORD dwCreationDisposition=0;
		if( oflag & _O_RDWR ){
			dwDesiredAccess = GENERIC_READ |GENERIC_WRITE;
		}
		else if( oflag & _O_WRONLY ){
			dwDesiredAccess = GENERIC_WRITE;
		}
		else{
			dwDesiredAccess = GENERIC_READ;
		}
		if( oflag & _O_CREAT ){
			// 作成CABファイルが既に存在する場合はFCICreateがエラーになるようにしたいけど、
			// CREATE_NEWを使うと一時ファイルが開けなくなり動かない。FCIは既に存在する
			// ファイルを_O_TRUNCなし_O_CREATだけで開くことを期待しているのか？？？
			// うーむ…FCICreateの前に自力確認するか…。
			//if( oflag & _O_TRUNC )
				dwCreationDisposition = CREATE_ALWAYS;
			//else
				//dwCreationDisposition = CREATE_NEW;
		}
		else{
			dwCreationDisposition = OPEN_EXISTING;
		}
	retry:
		fd = (int)CreateFileW(
					wpath
					,dwDesiredAccess
					,FILE_SHARE_READ
					,NULL
					,dwCreationDisposition
					,FILE_ATTRIBUTE_NORMAL
					,NULL
		);
		if( (HANDLE)fd==INVALID_HANDLE_VALUE ){
			fd = -1;
			*err = GetLastError();
			if( *err==ERROR_PATH_NOT_FOUND ){
				WCHAR* bs = wcsrchr( wpath, L'\\' );
				if( bs ){
					*bs = L'\0';
					SHCreateDirectory( NULL, wpath );
					*bs = L'\\';
				}
				goto retry;
			}
			LogW(L"L%u:CreateFile(%s)エラー%u",__LINE__,wpath,*err);
		}
		free( wpath );
	}
	return fd;
}
// FNOPEN macro
// http://msdn.microsoft.com/en-us/library/ff797946%28v=vs.85%29.aspx
int DIAMONDAPI fdiOpen( char* pszFile, int oflag, int pmode )
{
	int err, pv;
	return fciOpen( pszFile, oflag, pmode, &err, &pv );
}
// FNFCIREAD macro
// http://msdn.microsoft.com/en-us/library/ff797940%28v=vs.85%29.aspx
UINT DIAMONDAPI fciRead( int hf, void* memory, UINT cb, int* err, void* pv )
{
	DWORD readed=0;
	if( ReadFile( (HANDLE)hf, memory, cb, &readed, NULL ) ) return readed;
	*err = GetLastError();
	LogW(L"L%u:ReadFile()エラー%u",__LINE__,*err);
	return -1;
}
// FNREAD macro
// http://msdn.microsoft.com/en-us/library/ff797947%28v=vs.85%29.aspx
UINT DIAMONDAPI fdiRead( int hf, void* memory, UINT cb )
{
	int err, pv;
	return fciRead( hf, memory, cb, &err, &pv );
}
// FNFCIWRITE macro
// http://msdn.microsoft.com/en-us/library/ff797943%28v=vs.85%29.aspx
UINT DIAMONDAPI fciWrite( int hf, void* memory, UINT cb, int* err, void* pv )
{
	DWORD written=0;
	if( WriteFile( (HANDLE)hf, memory, cb, &written, NULL ) ) return written;
	*err = GetLastError();
	LogW(L"L%u:WriteFile()エラー%u",__LINE__,*err);
	return -1;
}
// FNWRITE macro
// http://msdn.microsoft.com/en-us/library/ff797949%28v=vs.85%29.aspx
UINT DIAMONDAPI fdiWrite( int hf, void* memory, UINT cb )
{
	int err, pv;
	return fciWrite( hf, memory, cb, &err, &pv );
}
// FNFCICLOSE macro
// http://msdn.microsoft.com/en-us/library/ff797932%28v=vs.85%29.aspx
int DIAMONDAPI fciClose( int hf, int* err, void* pv )
{
	if( CloseHandle( (HANDLE)hf ) ) return 0;
	*err = GetLastError();
	LogW(L"L%u:CloseHandle()エラー%u",__LINE__,*err);
	return -1;
}
// FNCLOSE macro
// http://msdn.microsoft.com/en-us/library/ff797930%28v=vs.85%29.aspx
int DIAMONDAPI fdiClose( int hf )
{
	int err, pv;
	return fciClose( hf, &err, &pv );
}
// FNFCISEEK macro
// http://msdn.microsoft.com/en-us/library/ff797941%28v=vs.85%29.aspx
long DIAMONDAPI fciSeek( int hf, long dist, int seektype, int* err, void* pv )
{
	DWORD rt = SetFilePointer( (HANDLE)hf, dist, NULL, seektype );
	if( rt==INVALID_SET_FILE_POINTER ){
		*err = GetLastError();
		LogW(L"L%u:SetFilePointerエラー%u",__LINE__,*err);
		return -1;
	}
	return rt;
}
// FNSEEK macro
// http://msdn.microsoft.com/en-us/library/ff797948%28v=vs.85%29.aspx
long DIAMONDAPI fdiSeek( int hf, long dist, int seektype )
{
	int err, pv;
	return fciSeek( hf, dist, seektype, &err, &pv );
}
// FNFCIDELETE macro
// http://msdn.microsoft.com/en-us/library/ff797933%28v=vs.85%29.aspx
int DIAMONDAPI fciDelete( char* pszFile, int* err, void* pv )
{
	int rt = -1;
	WCHAR* wpath = MultiByteToWideCharAlloc( pszFile, CP_UTF8 );
	if( wpath ){
		if( DeleteFileW( wpath ) ){
			rt = 0;
		}
		else{
			*err = GetLastError();
			LogW(L"L%u:DeleteFile(%s)エラー%u",__LINE__,wpath,*err);
		}
		free( wpath );
	}
	return rt;
}
// FNFCIGETTEMPFILE macro
// http://msdn.microsoft.com/en-us/library/ff797938%28v=vs.85%29.aspx
BOOL DIAMONDAPI fciTempFile( char* pszTempName, int cbTempName, void* pv )
{
	BOOL success = FALSE;
	if( pszTempName ){
		char dir[MAX_PATH+1]="";
		// システム一時フォルダ(C:\DOCUME~1\user\LOCALS~1\Temp)
		if( GetTempPathA(MAX_PATH, dir) ){
			// GetTempFileNameは実際にファイル作成までするもよう。
			if( GetTempFileNameA(dir, "jcbkm", 0, pszTempName) ){
			    success = TRUE;
			}
		}
	}
	return success;
}
long DIAMONDAPI cabStatus( UINT typeStatus, ULONG cb1, ULONG cb2, void* pv )
{
	return 0;
}
// FNFCIGETOPENINFO macro
// http://msdn.microsoft.com/en-us/library/ff797937%28v=vs.85%29.aspx
// TODO:ファイル更新日時か、作成日時か、どちらか１つしか日時をアーカイブできない？
int DIAMONDAPI cabGetOpenInfo( char* pszName, USHORT* pdate, USHORT* ptime, USHORT* pattribs, int* err, void* pv )
{
	int fd = fciOpen( pszName, _O_RDONLY, 0, err, pv );
	if( fd >0 ){
		FILETIME fileTime;
		BY_HANDLE_FILE_INFORMATION info;
		if( GetFileInformationByHandle( (HANDLE)fd, &info )
			//&& FileTimeToLocalFileTime( &info.ftCreationTime, &fileTime )
			&& FileTimeToLocalFileTime( &info.ftLastWriteTime, &fileTime )
			&& FileTimeToDosDateTime( &fileTime, pdate, ptime )
		){
			*pattribs = (USHORT)info.dwFileAttributes;
			*pattribs &= ( _A_RDONLY |_A_HIDDEN |_A_SYSTEM |_A_ARCH );
			*pattribs |= _A_NAME_IS_UTF;	// ファイル名をUTF-8で格納
		}
		else{
			fciClose( fd, err, pv );
			fd = -1;
		}
	}
	return fd;
}
// FNFDINOTIFY macro
// http://msdn.microsoft.com/en-us/library/ff797944%28v=vs.85%29.aspx
int DIAMONDAPI fdiNotify( FDINOTIFICATIONTYPE type, PFDINOTIFICATION ntfy )
{
	switch( type ){
	case fdintCOPY_FILE:
		// 展開先ファイルを作成オープンする。
		// ntfy->pvにフォルダパス、ntfy->psz1にファイル名が入っている。
		// pvはUTF-8（FDICopyにUTF-8で渡しておりそのまま）。
		// psz1は、ntfy->attribs の _A_NAME_IS_UTF がONなら UTF-8、OFFならSJIS(CP_ACP)。
		// JCBookmarkスナップショットCABは必ず _A_NAME_IS_UTF なのでSJIS考慮はいらないが…。
		// TODO:psz1はファイル名でなく相対パス・絶対パスの場合もある。FDIAddFileの指定により可変。
		// 絶対パスを優先する場合は、フォルダパスを無視することになるか。でも絶対パスのドライブが
		// 存在しない環境も考えられるが…それはエラーか？フォルダはぜんぶ作ってしまえばいいか。
		// 指定フォルダに展開するか、絶対パスを復元するかを選べるような感じか。
		{
			HANDLE hFile = INVALID_HANDLE_VALUE;
			WCHAR* wpath = NULL;
			if( ntfy->attribs & _A_NAME_IS_UTF ){
				// pv,psz1共にUTF-8
				UCHAR* path = strjoin( ntfy->pv ,"\\" ,ntfy->psz1 ,0,0 );
				if( path ){
					wpath = MultiByteToWideCharAlloc( path, CP_UTF8 );
					free( path );
				}
			}
			else{
				// pvはUTF-8、psz1はSJIS(CP_ACP)
				WCHAR* wdir = MultiByteToWideCharAlloc( ntfy->pv, CP_UTF8 );
				if( wdir ){
					WCHAR* wname = MultiByteToWideCharAlloc( ntfy->psz1, CP_ACP );
					if( wname ){
						wpath = wcsjoin( wdir, L"\\", wname, 0,0 );
						free( wname );
					}
					free( wdir );
				}
			}
			if( wpath ){
				WCHAR* bs = wcsrchr( wpath, L'\\' );
				if( bs ){
					*bs = L'\0';
					SHCreateDirectory( NULL, wpath );
					*bs = L'\\';
				}
				hFile = CreateFileW(
							wpath
							,GENERIC_WRITE
							,0, NULL
							,CREATE_ALWAYS
							,FILE_ATTRIBUTE_NORMAL
							,NULL
				);
				if( hFile !=INVALID_HANDLE_VALUE ){
					// 断片化抑制
					SetFilePointer( hFile, ntfy->cb, NULL, FILE_BEGIN );
					SetEndOfFile( hFile );
					SetFilePointer( hFile, 0, NULL, FILE_BEGIN );
				}
				else LogW(L"L%u:CreateFile(%s)エラー%u",__LINE__,wpath,GetLastError());
				free( wpath );
			}
			return (hFile==INVALID_HANDLE_VALUE)? -1 : (int)hFile;
		}
	case fdintCLOSE_FILE_INFO:
		// 展開ファイルの属性をセットしてクローズする。
		// TODO:日時情報が１つだけなので最終アクセス日時とかは復元はできない。
		{
			BOOL success = FALSE;
			WCHAR* wpath = NULL;
			FILETIME time, local;
			DosDateTimeToFileTime( ntfy->date, ntfy->time, &time );
			LocalFileTimeToFileTime( &time, &local );
#if 0
			// SetFileInformationByHandleはVistaからのAPIなのか？使えない。
			FILE_BASIC_INFO fbi;
			fbi.CreationTime.LowPart = local.dwLowDateTime;
			fbi.CreationTime.HighPart = local.dwHighDateTime;
			fbi.LastWriteTime = fbi.CreationTime;
			fbi.ChangeTime.QuadPart = -1;
			fbi.LastAccessTime.QuadPart = -1;
			fbi.FileAttributes = ntfy->attribs;
			fbi.FileAttributes &= ( _A_RDONLY |_A_HIDDEN |_A_SYSTEM |_A_ARCH );
			SetFileInformationByHandle( (HANDLE)ntfy->hf, FileBasicInfo, &fbi, sizeof(fbi) );
#endif
			SetFileTime( (HANDLE)ntfy->hf, &local, NULL, &local );
			CloseHandle( (HANDLE)ntfy->hf );
			if( ntfy->attribs & _A_NAME_IS_UTF ){
				UCHAR* path = strjoin( ntfy->pv ,"\\" ,ntfy->psz1 ,0,0 );
				if( path ){
					wpath = MultiByteToWideCharAlloc( path, CP_UTF8 );
					free( path );
				}
			}
			else{
				WCHAR* wdir = MultiByteToWideCharAlloc( ntfy->pv, CP_UTF8 );
				if( wdir ){
					WCHAR* wname = MultiByteToWideCharAlloc( ntfy->psz1, CP_ACP );
					if( wname ){
						wpath = wcsjoin( wdir, L"\\", wname, 0,0 );
						free( wname );
					}
					free( wdir );
				}
			}
			if( wpath ){
				DWORD attr = ntfy->attribs;
				attr &= ( _A_RDONLY |_A_HIDDEN |_A_SYSTEM |_A_ARCH );
				attr &= ~_A_NAME_IS_UTF;
				if( SetFileAttributesW( wpath, attr ) ){
					LogW(L"[展開]%s",wpath);
					success = TRUE;
				}
				else LogW(L"L%u:SetFileAttributes(%s)エラー%u",__LINE__,wpath,GetLastError());
				free( wpath );
			}
			return success;
		}
	/* 分割CABファイルの時に使うもの
	case fdintNEXT_CABINET: break;
	case fdintPARTIAL_FILE: break;
	case fdintCABINET_INFO: break;
	case fdintENUMERATE: break;
	*/
	default: break;
	}
	return 0;
}
// CAB圧縮
// wcab	: 作成CABファイルパス
// count: 格納ファイル数
// path	: 格納ファイルパスリスト(path[0]～path[count-1]まで)、NULLダメ
// name	: 格納ファイル名リスト(name[0]～name[count-1]まで)、NULLでもよし
BOOL cabCompress( const WCHAR* wcab, UINT count, const WCHAR** path, const WCHAR** name )
{
	BOOL err = FALSE;
	UCHAR* u8cab = WideCharToUTF8alloc( wcab );
	if( u8cab ){
		UCHAR* cabname = strrchr( u8cab, '\\' );
		if( cabname ){
			HFCI	hfci;
			CCAB	cab;
			ERF		erf;
			memset(&cab, 0, sizeof(cab));
			strcpy(cab.szCab, cabname+1);	// 作成するCABファイル名
			cabname[1] = '\0';				// フォルダ名末尾'\'(でないとダメ)
			strcpy(cab.szCabPath, u8cab);	// 作成するフォルダ名
			hfci = FCICreate(
						&erf
						,fciFilePlaced
						,cabAlloc
						,cabFree
						,fciOpen
						,fciRead
						,fciWrite
						,fciClose
						,fciSeek
						,fciDelete
						,fciTempFile
						,&cab
						,NULL
			);
			if( hfci ){
				UINT i;
				for( i=0; i<count; i++ ){
					// TODO:フォルダ対応
					// http://eternalwindows.jp/installer/cabinet/cabinet04.html
					// フォルダを再帰的にFCIAddFileしていく。
					// 第3引数の格納ファイル名は、相対パス・絶対パスでも問題ないもよう。
					// アーカイバなら相対パス格納か絶対パス格納か選択する話か？
					// ただ、ドライブ名から異なる複数ファイル・フォルダを格納する時は、
					// 絶対パスじゃないと展開する時に困るのかな？
					UCHAR* u8path = WideCharToUTF8alloc( path[i] );
					UCHAR* u8name = WideCharToUTF8alloc( name? name[i] : PathFindFileNameW(path[i]) );
					if( u8path && u8name ){
						if( FCIAddFile(
								hfci
								,u8path		// 追加ファイルパス
								,u8name		// 格納ファイル名(UTF-8)GetOpenInfoの_A_NAME_IS_UTFと対応
								,FALSE
								,NULL
								,cabStatus
								,cabGetOpenInfo
								//,tcompTYPE_NONE		// 圧縮なし
								,tcompTYPE_MSZIP		// MSZIP
								//,tcompTYPE_QUANTUM	// ？
								//,tcompTYPE_LZX		// ？
								)
						){
							//LogA("圧縮:%s",u8name);
						}
						else{
							LogW(L"FCIAddFile(%s)エラー%d",path[i],erf.erfOper);
							err = TRUE;
						}
					}
					if( u8path ) free( u8path );
					if( u8name ) free( u8name );
				}
				if( FCIFlushCabinet( hfci, FALSE, NULL, cabStatus ) ){
					//LogW(L"圧縮完了=%s",wcab);
				}
				else{
					LogW(L"FCIFlushCabinetエラー%d",erf.erfOper);
					err = TRUE;
				}
				FCIDestroy( hfci );
			}
			else{
				LogW(L"FCICreateエラー%d",erf.erfOper);
				err = TRUE;
			}
		}
		else{
			LogW(L"不正パス=%s",wcab);
			err = TRUE;
		}
		free( u8cab );
	}
	else err = TRUE;

	if( err ) DeleteFileW( wcab );
	return !err;
}
// CAB展開
BOOL cabDecomp( const WCHAR* wcab, const WCHAR* wdir )
{
	//LogW(L"%s を %s に展開します",wcab,wdir);
	BOOL success = FALSE;
	HFDI hfdi;
	ERF erf;
	hfdi = FDICreate(
			cabAlloc
			,cabFree
			,fdiOpen
			,fdiRead
			,fdiWrite
			,fdiClose
			,fdiSeek
			,cpu80386
			,&erf
	);
	if( hfdi ){
		UCHAR* cabdir = WideCharToUTF8alloc( wcab );
		UCHAR* outdir = WideCharToUTF8alloc( wdir );
		if( cabdir && outdir ){
			UCHAR* bs = strrchr(cabdir,'\\');
			if( bs ){
				UCHAR* cabname = strdup( bs+1 );
				if( cabname ){
					bs[1] = '\0';
					if( FDICopy(
							hfdi
							,cabname	// CABファイル名
							,cabdir		// CABファイルフォルダパス
							,0
							,fdiNotify
							,NULL
							,outdir		// 出力フォルダパス
						)
					){
						success=TRUE;
						//LogW(L"[展開]%s",wcab);
					}
					else LogA("FDICopy(%s%s)エラー%d",cabdir,cabname,erf.erfOper);
					free( cabname );
				}
			}
		}
		if( cabdir ) free( cabdir );
		if( outdir ) free( outdir );
		FDIDestroy( hfdi );
	}
	else LogW(L"FDICreateエラー%d",erf.erfOper);
	return success;
}











//---------------------------------------------------------------------------------------------------------------
// HTTPサーバ設定
//
SOCKET	ListenSock1		= INVALID_SOCKET;	// Listenソケット
SOCKET	ListenSock2		= INVALID_SOCKET;	// Listenソケット
WCHAR	ListenPort[8]	= L"10080";			// Listenポート
BOOL	BindLocal		= FALSE;			// bindアドレスをlocalhostに
BOOL	LoginRemote		= FALSE;			// localhost以外パスワード必要
BOOL	LoginLocal		= FALSE;			// localhostもパスワード必要
BOOL	HttpsRemote		= FALSE;			// localhost以外https
BOOL	HttpsLocal		= FALSE;			// localhostもhttps
BOOL	BootMinimal		= FALSE;			// 起動時から最小化
// 設定ファイルからグローバル変数に読込
void ServerParamGet( void )
{
	WCHAR* ini = AppFilePath(L"my.ini");
	// 初期値
	wcscpy( ListenPort ,L"10080" );
	BindLocal = LoginRemote = LoginLocal = HttpsRemote = HttpsLocal = BootMinimal = FALSE;
	if( ini ){
		FILE* fp = _wfopen(ini,L"rb");
		if( fp ){
			UCHAR buf[1024];
			// メモ帳で編集した場合 UTF-8 BOM がつく場合があるので読み飛ばす
			fgets(buf,4,fp); if( !(buf[0]==0xEF && buf[1]==0xBB && buf[2]==0xBF) ) rewind(fp);
			while( fgets(buf,sizeof(buf),fp) ){
				chomp(buf);
				if( strnicmp(buf,"ListenPort=",11)==0 && *(buf+11) ){
					MultiByteToWideChar( CP_UTF8, 0, buf+11, -1, ListenPort, sizeof(ListenPort)/sizeof(WCHAR) );
					ListenPort[sizeof(ListenPort)/sizeof(WCHAR)-1]=L'\0';
				}
				else if( strnicmp(buf,"BindLocal=",10)==0 && *(buf+10) ){
					BindLocal = TRUE;
				}
				else if( strnicmp(buf,"LoginRemote=",12)==0 && *(buf+12) ){
					LoginRemote = TRUE;
				}
				else if( strnicmp(buf,"LoginLocal=",11)==0 && *(buf+11) ){
					LoginLocal = TRUE;
				}
				else if( strnicmp(buf,"HttpsRemote=",12)==0 && *(buf+12) ){
					HttpsRemote = TRUE;
				}
				else if( strnicmp(buf,"HttpsLocal=",11)==0 && *(buf+11) ){
					HttpsLocal = TRUE;
				}
				else if( strnicmp(buf,"BootMinimal=",12)==0 && *(buf+12) ){
					BootMinimal = TRUE;
				}
			}
			fclose(fp);
		}
		free( ini );
	}
}
// http://www.openssl.org/docs/crypto/BIO_f_base64.html
// http://devenix.wordpress.com/2008/01/18/howto-base64-encode-and-decode-with-c-and-openssl-2/
// http://www.ioncannon.net/programming/34/howto-base64-encode-with-cc-and-openssl/
// http://www.fireproject.jp/feature/c-language/openssl/base64.html
BOOL base64encode( UCHAR* data ,size_t databytes ,UCHAR* b64txt ,size_t b64bytes )
{
	BOOL success = FALSE;
	BIO* b64 = BIO_new( BIO_f_base64() );
	BIO* bio = BIO_new( BIO_s_mem() );
	if( b64 && bio ){
		BUF_MEM* bp = NULL;
		BIO_push( b64 ,bio );
		if( BIO_write( b64 ,data ,databytes ) <=0 )
			LogW(L"BIO_writeエラー");
		BIO_flush( b64 );
		BIO_get_mem_ptr( b64 ,&bp );
		if( bp ){
			if( bp->length <b64bytes ){
				memcpy( b64txt ,bp->data ,bp->length );
				b64txt[bp->length] = '\0';
				chomp(b64txt); // なぜか末尾に改行コードがあるので削除
				success = TRUE;
			}
			else LogW(L"base64encode:バッファが足りません");
		}
		else LogW(L"BIO_get_mem_ptrエラー");
	}
	else LogW(L"BIO_newエラー");
	if( bio ) BIO_free( bio );
	if( b64 ) BIO_free( b64 );
	return success;
}
// 出力バッファdataはlen以上バイトぶん確保しておくこと
// http://d.hatena.ne.jp/stonife/20100306/p1
BOOL base64decode( UCHAR* b64txt ,size_t len ,UCHAR* data )
{
	BOOL success = FALSE;
	BIO* b64 = BIO_new( BIO_f_base64() );
	BIO* bio = BIO_new_mem_buf( b64txt ,len );
	if( b64 && bio ){
		BIO_set_flags( b64 ,BIO_FLAGS_BASE64_NO_NL ); // 末尾改行コードあっても大丈夫
		BIO_push( b64 ,bio );
			memset( data ,0 ,len );
			if( BIO_read( b64 ,data ,len ) >0 ){
				success = TRUE;
			}
			else LogW(L"BIO_readエラー");
	}
	else LogW(L"BIO_new/BIO_new_mem_bufエラー");
	if( bio ) BIO_free( bio );
	if( b64 ) BIO_free( b64 );
	return success;
}
// 以下のため変な引数と戻り値になっている
// ・戻り値のTRUE/FALSE ＝ 設定値があるかどうか(LoginPass=ならFALSE)
// ・引数は有効なら設定値(base64エンコード文字列)が入る(ただしバッファ不足の時は空にして返却)
BOOL LoginPass( UCHAR* digest ,size_t bytes )
{
	BOOL found = FALSE;
	WCHAR* ini = AppFilePath(L"my.ini");
	if( ini ){
		FILE* fp = _wfopen(ini,L"rb");
		if( fp ){
			UCHAR buf[1024];
			// メモ帳で編集した場合 UTF-8 BOM がつく場合があるので読み飛ばす
			fgets(buf,4,fp); if( !(buf[0]==0xEF && buf[1]==0xBB && buf[2]==0xBF) ) rewind(fp);
			while( fgets(buf,sizeof(buf),fp) ){
				chomp(buf);
				if( strnicmp(buf,"LoginPass=",10)==0 && *(buf+10) ){
					if( digest ){
						if( strlen(buf+10) <bytes ){
							strncpy( digest ,buf+10 ,bytes );
						}
						else{
							LogW(L"LoginPass=文字列が長すぎます");
							*digest = '\0';
						}
					}
					found = TRUE;
					break;
				}
			}
			fclose( fp );
		}
		free( ini );
	}
	return found;
}
// URLデコード
// http://www.kinet.or.jp/hiromin/cgi_introduction/appendix/url_encode/x_www_form_url_translator.c
// http://bytes.com/topic/c/answers/601171-int-urldecode-char-src-char-last-char-dest
// http://www.joinc.co.kr/modules/moniwiki/wiki.php/Site/Code/C/urlencode
// http://www.endoshoji.co.jp/cat_menu/src/kensaku.h
BOOL URLdecode( const UCHAR* src ,size_t srclen ,UCHAR* dst ,size_t dstlen )
{
	BOOL success = FALSE;
	const UCHAR* srcEnd = src + srclen;
	UCHAR* dstEnd = dst + dstlen;
	for( ; src <srcEnd && dst <dstEnd; src++, dst++ ){
		if( *src=='%' ){
			if( src+2 <srcEnd ){
				UCHAR hex[3] = { src[1] ,src[2] ,'\0' };
				long code = strtol( hex ,NULL ,16 );
				*dst = (UCHAR)code;
				src += 2;
			}
			else{
				*dst = '%';
			}
		}
		else if( *src=='+' ){
			*dst = ' ';
		}
		else{
			*dst = *src;
		}
	}
	if( dst <dstEnd ){
		*dst = '\0';
		success = TRUE;
	}
	else if( dst==dstEnd && src==srcEnd ){
		*(dst-1) = '\0';
		success = TRUE;
	}
	else{
		LogW(L"URLdecode:出力バッファが足りません");
		*(dstEnd-1) = '\0';
	}
	return success;
}
// HTTPログインセッション
// http://www.studyinghttp.net/cookies
// http://ja.wikipedia.org/wiki/HTTP_cookie
// http://sehermitage.web.fc2.com/security/cookie.html
// http://www.jumperz.net/texts/csrf1.2.htm
// http://www.ipa.go.jp/files/000017508.pdf
// http://sc.seeeko.com/archives/4570034.html
// http://www.ipa.go.jp/security/awareness/vendor/programmingv2/contents/302.html
// http://www.ipa.go.jp/security/awareness/vendor/programmingv2/contents/303.html
CRITICAL_SECTION	SessionCS ={0};		// スレッド間排他
Session*			Session0 = NULL;	// セッションリスト先頭
// セッション１つ生成
Session* SessionCreate( void )
{
	// 乱数生成
	// http://www.openssl.org/docs/crypto/RAND_bytes.html
	// http://tkyk.name/blog/2009/06/06/PHP-Ruby-Programming-Encryption/
	UCHAR rand[1024]="";
	if( RAND_bytes( rand ,sizeof(rand) ) ){
		UCHAR session[SHA256_DIGEST_LENGTH*2]="";
		UCHAR digest[SHA256_DIGEST_LENGTH]="";
		// ハッシュ値にして
		SHA256( rand ,sizeof(rand) ,digest );
		// BASE64
		if( base64encode( digest ,sizeof(digest) ,session ,sizeof(session) ) ){
			size_t len = strlen( session );
			Session* sp;
			while( session[len-1]==' ' ) session[--len]='\0';
			sp = malloc( sizeof(Session) + len );
			if( sp ){
				memcpy( sp->id, session, len );
				sp->id[len] = '\0';
				// リスト先頭に追加
				EnterCriticalSection( &SessionCS );
				sp->next = Session0;
				Session0 = sp;
				LeaveCriticalSection( &SessionCS );
				return sp;
			}
			else LogW(L"L%u:malloc(%u)エラー",__LINE__,sizeof(Session)+len);
		}
	}
	else LogW(L"RAND_bytesエラー");
	return NULL;
}
// セッション１つ削除
void SessionRemove( Session* target )
{
	if( !target ) return;
	if( target==Session0 ){ // 先頭
		Session0 = target->next;
		free( target );
	}
	else{ // 先頭以外
		Session* sp ,*prev;
		for( prev=NULL ,sp=Session0; sp; prev=sp ,sp=sp->next ){
			if( sp==target ){
				prev->next = sp->next;
				free( sp );
				break;
			}
		}
	}
}
// CookieヘッダのセッションIDが有効かどうか
// なぜか/jquery/のファイルに対するリクエストに2つsession=が存在する。
//   Cookie: session=XXXXX; session=XXXXXX ←おなじセッションIDの場合
//   Cookie: session=XXXXX; session=YYYYYY ←ちがうセッションIDの場合
// login.html用にjquery.jsに穴を開けているがそのせい？どちらかが有効ならよしとする…。
Session* ClientSessionAlive( TClient* cp )
{
	UCHAR* top = cp->req.Cookie;
	UCHAR* sid;
	while( sid = stristr(top,"session=") ){
		sid += 8;
		if( *sid ){
			Session* sep = Session0;
			UCHAR ch;
			UCHAR* end = strchr(sid,' ');
			if( !end ) end = strchr(sid,';');
			if( end ) ch=*end, *end='\0'; // 一時破壊
			for( sep=Session0; sep; sep=sep->next ){
				if( strcmp( sid ,sep->id )==0 ){
					cp->session = sep;
					break;
				}
			}
			if( end ) *end=ch; // 破壊を戻す
			if( cp->session ) break; // セッション１つ見つかればOK
			top = sid; // 次
		}
		else break;
	}
	return cp->session;
}
// パスワード認証
// GET /:login HTTP/1.x
// この関数から戻った後は送信処理に行くので送信準備を必ず行って終了する。
// ブルートフォースアタック対策のため(?)パスワードが違った場合は少し待ってから応答を返す。
// その少し待ってる間メインスレッドを止めないよう一応スレッドで実行する。
#define LOGINPASS_MAX 64
unsigned __stdcall authenticate( void* tp )
{
	TClient* cp = tp;
	// リクエストメッセージ本文に p=パスワード(URLエンコード)
	if( strnicmp(cp->req.body,"p=",2)==0 && *(cp->req.body+2) ){
		UCHAR b64[SHA256_DIGEST_LENGTH*2]="";
		if( !cp->sslp ) LogW(L"[%u]注意:暗号化されていない平文パスワードを受信しました",Num(cp));
		// 設定ファイルパスワードハッシュ取得
		if( LoginPass( b64 ,sizeof(b64) ) && *b64 ){
			size_t b64len = strlen(b64);
			if( SHA256_DIGEST_LENGTH <= b64len ){
				UCHAR* pass = malloc( b64len );
				if( pass ){
					if( base64decode( b64 ,b64len ,pass ) ){
						// 受信パスワードハッシュ変換
						UCHAR* encpass = cp->req.body +2;
						UCHAR plain[LOGINPASS_MAX*2]=""; // 不正に長いパスワード用に*2
						if( URLdecode( encpass ,strlen(encpass) ,plain ,sizeof(plain) ) ){
							UCHAR digest[SHA256_DIGEST_LENGTH]="";
							SHA256( plain ,strlen(plain) ,digest );
							// ハッシュ値比較
							if( memcmp( pass ,digest ,SHA256_DIGEST_LENGTH )==0 ){
								// 認証成功:セッション生成
								Session* sep = SessionCreate();
								if( sep ){
									// 応答本文にセッションID
									BufferSends( &(cp->rsp.body) ,sep->id );
									BufferSendf( &(cp->rsp.head)
											,"HTTP/1.0 200 OK\r\n"
											"Content-Type: text/plain\r\n"
											"Content-Length: %u\r\n"
											,cp->rsp.body.bytes
									);
									LogA("[%u]ログイン(%s)",Num(cp),sep->id);
								}
								else ResponseError(cp,"500 Internal Server Error");
							}
							else{
								ResponseError(cp,"401 Unauthorized");
								Sleep(1000); // パスワード不正少し待つ
							}
						}
						else ResponseError(cp,"400 Bad Request");
					}
					else ResponseError(cp,"500 Internal Server Error");
					free( pass );
				}
				else{
					LogW(L"L%u:malloc(%u)エラー",__LINE__,b64len);
					ResponseError(cp,"500 Internal Server Error");
				}
			}
			else{
				LogW(L"設定ファイルパスワード情報が不正です(短すぎます)");
				ResponseError(cp,"500 Internal Server Error");
			}
		}
		else ResponseError(cp,"500 Internal Server Error");
	}
	else ResponseError(cp,"400 Bad Request");
	// 終了
	PostMessage( MainForm ,WM_THREADFIN ,(WPARAM)cp->sock ,0 );
	_endthreadex(0);
	return 0;
}











//---------------------------------------------------------------------------------------------------------------
// ソケット通信・HTTPプロトコル処理関連
//
// ファイルがあったらバックアップファイル作成
// TODO:複数世代つくる？
BOOL FileBackup( const WCHAR* path )
{
	if( path && *path ){
		HANDLE rFile = CreateFileW( path, GENERIC_READ, FILE_SHARE_READ
							,NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL
		);
		if( rFile !=INVALID_HANDLE_VALUE ){
			BOOL success = FALSE;
			WCHAR* tmp = wcsjoin( path, L".$$$", 0,0,0 );
			WCHAR* bak = wcsjoin( path, L".bak", 0,0,0 );
			if( tmp && bak ){
				HANDLE wFile = CreateFileW( tmp, GENERIC_WRITE, FILE_SHARE_READ
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
					else LogW(L"L%u:MoveFileEx(%s)エラー%u",__LINE__,tmp,GetLastError());
				}
				else LogW(L"L%u:CreateFile(%s)エラー%u",__LINE__,tmp,GetLastError());
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
WCHAR* RealPath( const UCHAR* path, WCHAR* realpath, size_t size )
{
	if( path && realpath ){
		WCHAR* wpath = MultiByteToWideCharAlloc( path, CP_UTF8 );
		if( wpath ){
			WCHAR* p;
			_snwprintf(realpath,size,L"%s\\%s",DocumentRoot,wpath);
			realpath[size-1]=L'\0';
			// パス区切りを \ に
			for( p=realpath; *p; p++ ){
				if( *p==L'/' ) *p = L'\\';
			}
			// 連続 \ を削除、ただし先頭 \\ は共有フォルダパスなので除外
			p = realpath +1;
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
UCHAR* file2memory( const WCHAR* path, BOOL fOpenErrLog )
{
	UCHAR* memory = NULL;
	if( path && *path ){
		HANDLE hFile = CreateFileW( path
							,GENERIC_READ ,FILE_SHARE_READ
							,NULL ,OPEN_EXISTING ,FILE_ATTRIBUTE_NORMAL ,NULL
		);
		if( hFile != INVALID_HANDLE_VALUE ){
			DWORD size = GetFileSize( hFile,NULL );
			memory = malloc( size +1 );
			if( memory ){
				DWORD bRead=0;
				if( ReadFile( hFile, memory, size, &bRead, NULL ) && bRead==size ){
					memory[size] = '\0';
				}
				else{
					LogW(L"L%u:ReadFileエラー%u",__LINE__,GetLastError());
					free( memory ), memory=NULL;
				}
			}
			else LogW(L"L%u:malloc(%u)エラー",__LINE__,size+1);
			CloseHandle( hFile );
		}
		else if( fOpenErrLog ) LogW(L"L%u:CreateFile(%s)エラー%u",__LINE__,path,GetLastError());
	}
	return memory;
}
BOOL UnderDocumentRoot( const WCHAR* path )
{
	if( path && wcsnicmp(path,DocumentRoot,DocumentRootLen)==0 ){
		if( path[DocumentRootLen]==L'\\' ) return TRUE;
		if( path[DocumentRootLen]==L'\0' ) return TRUE;
	}
	return FALSE;
}
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
void MultipartFormdataProc( TClient* cp, const WCHAR* tmppath )
{
	UCHAR* path = cp->req.path;
	if( *path=='/' ) path++;
	if( stricmp(path,"import.html")==0 && cp->req.ContentLength <1024*1024*10 ){ // 10MB未満なんとなく
		// HTMLインポート
		// multipart/form-dataの形式チェックはしない。
		// 1パートのみエンコードされていないプレーンテキスト前提。
		// NETSCAPE-Bookmark-file-1 形式を JSON に変換する。
		// 文字コードはUTF-8前提。チェックはしない。
		UCHAR* data = file2memory( tmppath, TRUE );
		if( data ){
			FILE* fp = _wfopen( tmppath, L"wb" );
			if( fp ){
				UCHAR* folderNameTop=NULL, *folderNameEnd=NULL;
				UCHAR* folderDateTop=NULL, *folderDateEnd=NULL;
				BYTE comment=0, doctype=0, topentry=0;
				UINT nextid=3;
				UINT count=0;
				int depth=0;
				UCHAR last='\0';
				UCHAR* p;
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
							UCHAR* strJSON = strndupJSON( folderNameTop, folderNameEnd - folderNameTop );
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
									UCHAR* strJSON = strndupJSON( folderNameTop, folderNameEnd - folderNameTop );
									if( strJSON ){
										fputs( strJSON, fp );
										free( strJSON );
									}
								}
								fputs("\",\"dateAdded\":\"",fp);
								if( folderDateTop && folderDateEnd ){
									fwrite( folderDateTop, folderDateEnd - folderDateTop, 1, fp );
									fwrite( "000", 3, 1, fp );
								}
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
							UCHAR* titleTop = strchr(p+7,'>');
							UCHAR* titleEnd = NULL;
							if( titleTop ){
								UCHAR* urlTop = stristr(p+6," HREF=\"");
								UCHAR* dateTop = stristr(p+6," ADD_DATE=\"");
								UCHAR* iconTop = stristrL(p+6," ICON_URI=\"",titleTop);//ICON_URI=は存在しない場合があるので無駄に検索しないよう上限つき
								UCHAR* urlEnd = NULL;
								UCHAR* dateEnd = NULL;
								UCHAR* iconEnd = NULL;
								if( urlTop && urlTop < titleTop ){
									urlTop += 7;
									urlEnd = strchr(urlTop,'"');
								}
								if( dateTop && dateTop < titleTop ){
									dateTop += 11;
									dateEnd = strchr(dateTop,'"');
								}
								if( iconTop ){
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
									fwrite( urlTop, urlEnd - urlTop, 1, fp );
								fputs("\",\"title\":\"",fp);
								if( titleTop && titleEnd ){
									UCHAR* strJSON = strndupJSON( titleTop, titleEnd - titleTop );
									if( strJSON ){
										fputs( strJSON, fp );
										free( strJSON );
									}
								}
								fputs("\",\"dateAdded\":\"",fp);
								if( dateTop && dateEnd ){
									fwrite( dateTop, dateEnd - dateTop, 1, fp );
									fwrite( "000", 3, 1, fp );
								}
								fputs("\",\"icon\":\"",fp);
								if( iconTop && iconEnd ){
									*iconEnd = '\0';
									if( stristr(iconTop,"://www.mozilla.org/") && stristr(iconTop,"/made-up-favicon/") )
										; // Mozilla仮URL無視
									else fwrite( iconTop, iconEnd - iconTop, 1, fp );
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
						,GENERIC_READ ,FILE_SHARE_READ ,NULL ,OPEN_EXISTING ,FILE_ATTRIBUTE_NORMAL ,NULL
				);
				if( cp->rsp.readfh ){
					SYSTEMTIME st;
					UCHAR inetTime[INTERNET_RFC1123_BUFSIZE];
					GetSystemTime( &st );
					InternetTimeFromSystemTimeA(&st,INTERNET_RFC1123_FORMAT,inetTime,sizeof(inetTime));
					BufferSendf( &(cp->rsp.head)
							,"HTTP/1.0 200 OK\r\n"
							"Date: %s\r\n"
							"Content-Type: text/plain; charset=utf-8\r\n"
							"Content-Length: %u\r\n"
							,inetTime
							,GetFileSize(cp->rsp.readfh,NULL)
					);
				}
				else{
					LogW(L"[%u]CreateFile(%s)エラー%u",Num(cp),tmppath,GetLastError());
					ResponseError(cp,"500 Internal Server Error");
				}
			}
			else{
				LogW(L"[%u]fopen(%s)エラー",Num(cp),tmppath);
				ResponseError(cp,"500 Internal Server Error");
			}
			free( data );
		}
		else ResponseError(cp,"500 Internal Server Error");
	}
	else ResponseError(cp,"400 Bad Request");
}

// 指定IPアドレスをこのマシンが持ってるかどうか。
// IPを列挙するには、GetAdaptersAddresses()とWSAIoctl(SIO_GET_INTERFACE_LIST)とgethostname()と3方式くらい
// あるもよう。ipconfigに一番近そうなGetAdaptersAddresses()を使う。
// http://members.jcom.home.ne.jp/toya.hiroshi/get_my_ipaddress.html
// http://msdn.microsoft.com/en-us/library/aa365915(VS.85).aspx
// http://dev.ariel-networks.com/column/tech/windows-ipconfig/
// http://frog.raindrop.jp/knowledge/archives/002204.html
// http://atamoco.boy.jp/cpp/windows/network/get-adapters-addresses.php
BOOL AdapterHas( const WCHAR* text )
{
	IP_ADAPTER_ADDRESSES*	adps;
	ULONG					bytes = 1024; // 1024適当
	BOOL					found = FALSE;
	for( ;; ){
		adps = malloc( bytes );
		if( adps ){
			ULONG ret = GetAdaptersAddresses(
							AF_UNSPEC
							,GAA_FLAG_SKIP_ANYCAST |GAA_FLAG_SKIP_MULTICAST
							|GAA_FLAG_SKIP_DNS_SERVER |GAA_FLAG_SKIP_FRIENDLY_NAME
							,0
							,adps
							,&bytes
			);
			if( ret==NO_ERROR ){
				IP_ADAPTER_ADDRESSES* adp;
				for( adp=adps; adp; adp=adp->Next ){
					IP_ADAPTER_UNICAST_ADDRESS* uni;
					for( uni=adp->FirstUnicastAddress; uni; uni=uni->Next ){
						WCHAR ip[INET6_ADDRSTRLEN+1]=L""; // IPアドレス文字列
						GetNameInfoW(
								uni->Address.lpSockaddr
								,uni->Address.iSockaddrLength
								,ip
								,sizeof(ip)/sizeof(WCHAR)
								,NULL
								,0
								,NI_NUMERICHOST
						);
						if( wcscmp( ip ,text )==0 ){ found=TRUE; break; } // 発見
					}
				}
				break; // おわり
			}
			else if( ret==ERROR_BUFFER_OVERFLOW ){
				free( adps );
				adps = NULL;
				// リトライ
			}
			else{ LogW(L"GetAdaptersAddresses不明なエラー%u",ret); break; }
		}
		else{ LogW(L"L%u:malloc(%u)エラー",__LINE__,bytes); break; }
	}
	if( adps ) free( adps );
	return found;
}
// クライアントがローカルで動作している
BOOL ClientIsLocal( TClient* cp )
{
	SOCKADDR_STORAGE addr;
	int		addrlen = sizeof(addr);
	WCHAR	ip[INET6_ADDRSTRLEN+1]=L""; // クライアントIP

	getpeername( cp->sock ,(SOCKADDR*)&addr ,&addrlen );
	GetNameInfoW( (SOCKADDR*)&addr, addrlen, ip, sizeof(ip)/sizeof(WCHAR), NULL, 0, NI_NUMERICHOST );

	//LogW(L"[%u]peer=%s",Num(cp),ip);
	if( wcscmp(ip,L"::1")==0 ) return TRUE;
	if( wcscmp(ip,L"127.0.0.1")==0 ) return TRUE;
	if( wcsicmp(ip,L"::ffff:127.0.0.1")==0 ) return TRUE;
	if( AdapterHas(ip) ) return TRUE;
	return FALSE;
}

// 待受ソケット作成
// IPv6対応は結局、待受ソケットを２つ作成するようにした。
// ・きっかけは、Win7+Opera12で「接続できません」エラーになるという問い合わせで、
// 　発覚したのがWin7では http://127.0.0.1:～/ に接続できない事だった。
// ・netstat -a を見ると、たしかに :: (IPv6のANY) では待受ているが、0.0.0.0 では
// 　待受ていない。加えてOpera12はIPv6環境でも ::1 (IPv6のloopback) ではなく
// 　127.0.0.1 にアクセスしようとするため、接続できなかったもよう。localhostの
// 　名前解決が他のブラウザと異なるのか。
// ・調べたところ１つのソケットでIPv4/IPv6両対応できる「デュアルスタック」という
// 　方式があるようで、これを導入したところ、うまく動作しOpera12問題は解消した。
// 　肝はsetsockoptでIPV6_V6ONLYフラグを落とす事。127.0.0.1のアクセスは接続元IP
// 　「::ffff:127.0.0.1」というアドレスとして認識され、どうもIPv4アドレスがIPv6
// 　アドレスにマッピングされているような感じ。
//　　http://msdn.microsoft.com/en-us/library/windows/desktop/bb513665%28v=vs.85%29.aspx
//　　http://msdn.microsoft.com/en-us/library/windows/desktop/ms737937(v=vs.85).aspx
// ・その後、bindアドレスを(ANYではなく)localhost(loopback)にできる機能を導入した
// 　ところ、ふたたびWin7+Opera12問題が発生した。挙動はおなじ。
// ・netstat -a を見ると、待受アドレスが ::1 と 0.0.0.0 の２つあっておかしい。
// 　0.0.0.0は127.0.0.1ではないのか。調べたたところ、デュアルスタックソケットは
// 　bindアドレスがANYなら動作するけど、指定アドレスbindでは動作しないような情報
// 　があり、指定アドレスbindの場合は結局IPv4アドレスとIPv6アドレスと２つ待受
// 　ソケットを作らないとダメっぽい感じであった。
//　　http://serverfault.com/questions/486038/dual-stack-mode-bind-to-any-address-other-than-0-0-0-0
// ・ANYの場合はデュアルスタックにしてloopbackの場合は２つソケット使うのも無駄に
// 　コードが増えるので、どちらも２つソケットを使うことにした。
// 　　ANY の場合は :: と 0.0.0.0 で待受。
// 　　Loopback の場合は ::1 と 127.0.0.1 で待受。
// IPv4とIPv6と２ソケットで待受して、さらにIPv6ソケット側はデュアルスタックにするのは意味なさそうやらない。
// TODO:↓の記事ではクライアントのデュアルスタック対応はGetAddrInfoで見つかった複数アドレスに
// 順番に成功するまでコネクトせよと書いてあるが・・そんなことしてない。
// http://blogs.msdn.com/b/japan_platform_sdkwindows_sdk_support_team_blog/archive/2012/05/10/winsock-api-ipv4-ipv6-tcp.aspx
SOCKET ListenAddrOne( const ADDRINFOW* adr )
{
	SOCKET	sock	= INVALID_SOCKET;
	BOOL	success	= FALSE;

	if( adr ){
		sock = socket( adr->ai_family, adr->ai_socktype, adr->ai_protocol );
		// Listenゾンビが発生した場合SO_REUSEADDRが有効。だが、副作用でポート競合しても(すでにListenされてても)
		// bindエラーにならず、ポートを奪い取ってしまうような挙動になる。自分のListenゾンビを奪うぶんにはいいが
		// 他アプリのポートだったら迷惑千万…やっぱポート重複エラーになってくれたほうがうれしい…
		//int on=1;
		//if( setsockopt( sock, SOL_SOCKET, SO_REUSEADDR, (char*)&on, sizeof(on) )!=SOCKET_ERROR ){
		if( bind( sock, adr->ai_addr, (int)adr->ai_addrlen )!=SOCKET_ERROR ){
			#define BACKLOG 128
			if( listen( sock, BACKLOG )!=SOCKET_ERROR ){
				// 待ち受け開始したので、次
				// ソケットに接続要求が届いた(FD_ACCEPT)ら、メッセージが来るようにする。
				// その時 lParam に FD_ACCEPT が格納されている。
				if( WSAAsyncSelect( sock, MainForm, WM_SOCKET, FD_ACCEPT )==0 ){
					WCHAR ip[INET6_ADDRSTRLEN+1]=L""; // IPアドレス文字列
					GetNameInfoW( adr->ai_addr ,adr->ai_addrlen ,ip ,sizeof(ip)/sizeof(WCHAR) ,NULL,0,NI_NUMERICHOST );
					LogW(L"[%u]ポート%sで待機します - http%s://%s:%s/"
							,sock
							,ListenPort
							,(HttpsRemote && HttpsLocal)? L"s" : (HttpsRemote || HttpsLocal)? L"(s)" :L""
							,ip ,ListenPort
					);
					success = TRUE;
				}
				else LogW(L"WSAAsyncSelectエラー%u",WSAGetLastError());
			}
			else LogW(L"listenエラー%u",WSAGetLastError());
		}
		else LogW(L"bindエラー%u",WSAGetLastError());
	}
	if( !success && sock !=INVALID_SOCKET ){
		shutdown( sock, SD_BOTH );
		closesocket( sock );
		sock = INVALID_SOCKET;
	}
	return sock;
}
BOOL ListenStart( void )
{
	ADDRINFOW*	adr		= NULL;
	ADDRINFOW	hint;
	BOOL		success	= FALSE;

	memset( &hint, 0, sizeof(hint) );
	hint.ai_socktype = SOCK_STREAM;
	hint.ai_protocol = IPPROTO_TCP;
	hint.ai_flags	 = AI_PASSIVE;

	if( GetAddrInfoW( BindLocal? L"localhost" :NULL ,ListenPort ,&hint ,&adr )==0 ){
		// IPv4とIPv6と2回
		ListenSock1 = ListenAddrOne( adr );
		ListenSock2 = ListenAddrOne( adr->ai_next );
		FreeAddrInfoW( adr );
	}
	else LogW(L"getaddrinfoエラー%u",WSAGetLastError());

	if( ListenSock1==INVALID_SOCKET && ListenSock2==INVALID_SOCKET ) return FALSE;
	return TRUE;
}

void SocketAccept( SOCKET sock )
{
	// クライアントと接続されたソケットを取得
	SOCKADDR_STORAGE	addr;
	int					addrlen = sizeof(addr);
	SOCKET				sock_new = accept( sock, (SOCKADDR*)&addr, &addrlen );
	if( sock_new !=INVALID_SOCKET ){
		// クライアントと接続確立
		TClient*	cp = ClientOfSocket(INVALID_SOCKET);
		WCHAR		ip[INET6_ADDRSTRLEN+1]=L""; // IPアドレス文字列
		BOOL		success = FALSE;
		SSL*		sslp = NULL;
		GetNameInfoW( (SOCKADDR*)&addr, addrlen, ip, sizeof(ip)/sizeof(WCHAR), NULL, 0, NI_NUMERICHOST );
		if( cp ){
			BOOL isSSL = FALSE;
			UCHAR loopback = 0;
			if( wcscmp(ip,L"::1")==0 || wcscmp(ip,L"127.0.0.1")==0 || wcsicmp(ip,L"::ffff:127.0.0.1")==0 ){
				// localhost(loopback)から接続
				if( HttpsLocal ) isSSL = TRUE;
				loopback = 1;
			}
			else{
				// localhost(loopback)以外から接続
				if( HttpsRemote ) isSSL = TRUE;
			}
			if( isSSL ){
				sslp = SSL_new( ssl_ctx );
				if( sslp ){
					SSL_set_fd( sslp, sock_new );
					LogW(L"[%u:%u]接続(SSL):%s",Num(cp),sock_new,ip);
					success = TRUE;
				}
				else LogW(L"[%u:%u]SSL_newエラー:%s",Num(cp),sock_new,ip);
			}
			else{
				LogW(L"[%u:%u]接続:%s",Num(cp),sock_new,ip);
				success = TRUE;
			}
			if( success ){
				success = FALSE;
				// ソケットにデータが届いた(FD_READ)または相手が切断した(FD_CLOSE)ら
				// メッセージが来るようにする。その時lParamにFD_READまたはFD_CLOSEが格納されている。
				if( WSAAsyncSelect( sock_new, MainForm, WM_SOCKET, FD_READ |FD_WRITE |FD_CLOSE )==0 ){
					#define REQUEST_BUFSIZE		1024
					#define RESPONSE_HEADSIZE	512
					#define RESPONSE_BODYSIZE	512
					cp->req.buf = malloc( REQUEST_BUFSIZE );
					cp->rsp.head.top = malloc( RESPONSE_HEADSIZE );
					cp->rsp.body.top = malloc( RESPONSE_BODYSIZE );
					if( cp->req.buf && cp->rsp.head.top && cp->rsp.body.top ){
						memset( cp->req.buf, 0, REQUEST_BUFSIZE );
						memset( cp->rsp.head.top, 0, RESPONSE_HEADSIZE );
						memset( cp->rsp.body.top, 0, RESPONSE_BODYSIZE );
						cp->req.bufsize		= REQUEST_BUFSIZE;
						cp->rsp.head.size	= RESPONSE_HEADSIZE;
						cp->rsp.body.size	= RESPONSE_BODYSIZE;
						cp->loopback= loopback;
						cp->sock	= sock_new;
						cp->sslp	= sslp;
						cp->status	= CLIENT_ACCEPT_OK;
						success		= TRUE;
					}
					else{
						LogW(L"L%u:mallocエラー",__LINE__);
						if( cp->req.buf ) free(cp->req.buf), cp->req.buf=NULL;
						if( cp->rsp.head.top ) free(cp->rsp.head.top), cp->rsp.head.top=NULL;
						if( cp->rsp.body.top ) free(cp->rsp.body.top), cp->rsp.body.top=NULL;
					}
				}
				else LogW(L"[%u:%u]WSAAsyncSelectエラー%u:%s",Num(cp),sock_new,WSAGetLastError(),ip);
			}
		}
		else LogW(L"[%u]同時接続数オーバー切断:%s",sock_new,ip);

		if( success ){
#ifdef HTTP_KEEPALIVE
			// TODO:ブラウザでリロードを繰り返すとしばしば表示まで待たされる事があり、JCBookmarkのログ
			// 出力タイミングと見比べると、どうもKeepAlive切断ログと同時にブラウザ側も表示されるような。
			// ひょっとしてJCBookmarkは送信したつもりでもデータがブラウザに届いておらず、KeepAlive切断
			// のタイミングでブラウザにデータが届いているのか？バッファリングされている？
			// http://support.microsoft.com/kb/214397/ja
			// TCP_NODELAYというsetsockoptオプションでNagleバッファリングを無効にできるらしい。
			// またSO_SNDBUFを0に設定してWinsockバッファリングを無効にすることも可能と書いてある。
			// が、どっちもやってみたが特に効果はなく、やはりしばしばブラウザが待たされる現象は発生する。
			// うーむわからない回避できない…とりあえずKeepAlive機能を殺した。うむ問題解消した。
			int on=1 ,zero=0;
			LogW(L"setsockopt(TCP_NODELAY,SO_SNDBUF=0)");
			if( setsockopt( sock_new ,IPPROTO_TCP ,TCP_NODELAY ,(char*)&on ,sizeof(on) )==SOCKET_ERROR )
				LogW(L"setsockopt(TCP_NODELAY)エラー%u",WSAGetLastError());
			if( setsockopt( sock_new ,SOL_SOCKET ,SO_SNDBUF ,(char*)&zero ,sizeof(zero) )==SOCKET_ERROR )
				LogW(L"setsockopt(SO_SNDBUF)エラー%u",WSAGetLastError());
#endif
		}
		else{
			if( sslp ) SSL_free( sslp );
			shutdown( sock_new, SD_BOTH );
			closesocket( sock_new );
		}
	}
	else LogW(L"acceptエラー%u",WSAGetLastError());
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
			if( cp->sslp ){
				int r = SSL_accept( cp->sslp );
				if( r==1 ){
					//LogW(L"[%u]SSL_accept成功",Num(cp));
					cp->status = CLIENT_RECV_MORE;
					// 受信処理へ
				}
				else if( r==-1 ){
					int err = SSL_get_error( cp->sslp, r );
					switch( err ){
					case SSL_ERROR_WANT_READ:
					case SSL_ERROR_WANT_WRITE:
						// SSL_acceptリトライ
						PostMessage( MainForm, WM_SOCKET, (WPARAM)sock, (LPARAM)FD_READ );
						break;
					default:
						LogW(L"[%u]SSL_accept不明なエラー%d",Num(cp),err);
						PostMessage( MainForm, WM_SOCKET, (WPARAM)sock, (LPARAM)FD_CLOSE );
					}
					break;
				}
				else{
					LogW(L"[%u]SSL_accept致命的エラー%d",Num(cp),r);
					PostMessage( MainForm, WM_SOCKET, (WPARAM)sock, (LPARAM)FD_CLOSE );
					break;
				}
			}
			else cp->status = CLIENT_RECV_MORE;
			// 受信処理へ

		case CLIENT_RECV_MORE:
		case CLIENT_KEEP_ALIVE:
			// 受信
			if( req->bytes >= req->bufsize-1 ){
				size_t newsize = req->bufsize * 2;
				UCHAR* newbuf = malloc( newsize );
				if( newbuf ){
					int distance = newbuf - req->buf;
					memset( newbuf, 0, newsize );
					memcpy( newbuf, req->buf, req->bufsize );
					if( req->method ) req->method += distance;
					if( req->path ) req->path += distance;
					if( req->param ) req->param += distance;
					if( req->ver ) req->ver += distance;
					if( req->head ) req->head += distance;
					if( req->ContentType ) req->ContentType += distance;
					if( req->UserAgent ) req->UserAgent += distance;
					if( req->IfModifiedSince ) req->IfModifiedSince += distance;
					if( req->Cookie ) req->Cookie += distance;
					if( req->boundary ) req->boundary += distance;
					if( req->body ) req->body += distance;
					free( req->buf );
					req->buf = newbuf;
					req->bufsize = newsize;
					LogW(L"[%u]受信バッファ拡大%ubytes",Num(cp),newsize);
				}
				else{
					LogA("[%u]リクエスト大杉:%s",Num(cp),req->buf);
					ResponseError(cp,"400 Bad Request");
				send_ready:
					cp->status = CLIENT_SEND_READY;
					PostMessage( MainForm, WM_SOCKET, (WPARAM)sock, (LPARAM)FD_WRITE );
					break;
				}
			}
			bytes = req->bufsize - req->bytes - 1;
			if( cp->sslp ){
				bytes = SSL_read( cp->sslp, req->buf + req->bytes, bytes );
				if( bytes==0 ){
					// コネクション切断
					break;
				}
				else if( bytes<0 ){
					int err = SSL_get_error( cp->sslp, bytes );
					switch( err ){
					case SSL_ERROR_WANT_READ:
					case SSL_ERROR_WANT_WRITE:
						// SSL_readリトライ
						break;
					default:
						LogW(L"[%u]SSL_read不明なエラー%d",Num(cp),err);
						PostMessage( MainForm, WM_SOCKET, (WPARAM)sock, (LPARAM)FD_CLOSE );
					}
					break;
				}
			}
			else bytes = recv( sock, req->buf + req->bytes, bytes, 0 );
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
						UCHAR* ct = strHeaderValue(++req->head,"Content-Type");
						UCHAR* cl = strHeaderValue(  req->head,"Content-Length");
						UCHAR* ua = strHeaderValue(  req->head,"User-Agent");
						UCHAR* ims= strHeaderValue(  req->head,"If-Modified-Since");
#ifdef HTTP_KEEPALIVE
						UCHAR* ka = strHeaderValue(  req->head,"Connection");
#endif
						UCHAR* ck = strHeaderValue(  req->head,"Cookie");
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
#ifdef HTTP_KEEPALIVE
						if( ka && stricmp(chomp(ka),"keep-alive")==0 ) req->KeepAlive = 1;
#endif
						if( ck ) req->Cookie = chomp(ck);
					}
					req->method = chomp(req->buf);
					req->path = strchr(req->method,' ');
					if( req->path ){
						*req->path++ = '\0';
						req->ver = strchr(req->path,' ');
						if( req->ver ) *req->ver++ = '\0';
						req->param = strchr(req->path,'?');
						if( req->param ) *req->param++ = '\0';
					}
				}
				if( req->method && req->path && req->ver ){
					UCHAR* file = req->path;
					while( *file=='/' ) file++;
					if( (LoginRemote && !cp->loopback) || (LoginLocal && cp->loopback) ){
						// ログインパスワード有効
						if( stricmp(file,"favicon.ico")==0 || stricmp(file,"jquery/jquery.js")==0 ){
							// 通常処理へ
							// faviconとjquery.jsはlogin.htmlで使うためセッションなくても返却する。
							// この特別扱いのせいか、ログアウトしてセッション破棄後も、jquery.jsの
							// リクエストには古いクッキーがついたままになってしまうもよう…。しかし
							// jqueryに穴を空けずlogin.htmlで外部jqueryを参照する(最初はそうしてた)と、
							// ログイン後に「$が見つからない」とかJavaScriptエラーになってしまう・・。
							// ログイン画面もログイン後もURLが変わらないのに、jQueryが変わってるから
							// だろうか？おなじURLでjQueryが変わるとダメ？HTTPリダイレクトを使って
							// login.htmlに飛ばすようにすればURLが変わるのでjqueryエラーは解消する？
							// ただリダイレクトで使うLocationヘッダは絶対URLしかダメらしく、Hostヘッダ
							// から生成するとか面倒だったり、filer.htmlにアクセスしてログイン画面が出て
							// ログインしたらfiler.htmlを表示したいけど、それを実現するには新しいGET/
							// POSTパラメータを作るとかRefererヘッダを見るとか？そのあたりがいま機能が
							// なくて実装しなければならぬ・・うーむ。jQueryローカル化をやめてぜんぶ
							// 外部jQuery参照にしても解決するかな？せっかくjQueryローカルにしたが・・。
						}
						else if( ClientSessionAlive(cp) ){
							// セッション有効ログイン済み
							if( stricmp(file,"login.html")==0 || stricmp(file,":login")==0 ){
								// index.htmlを返す
								// TODO:セッション有効なのにログイン要求のパスワードが間違っている時は？
								// セッション有効だから無視してもいい？認証処理すべき？Gmail利用中に他の
								// ブラウザでパスワード変更してもセッション維持されたままだったので、その
								// パターンと同じかな。パスワード変更しても有効済みセッションは維持される。
								cp->rsp.readfh = CreateFileW(
										RealPath("index.html",realpath,sizeof(realpath)/sizeof(WCHAR))
										,GENERIC_READ ,FILE_SHARE_READ ,NULL
										,OPEN_EXISTING ,FILE_ATTRIBUTE_NORMAL ,NULL
								);
								if( cp->rsp.readfh !=INVALID_HANDLE_VALUE ){
									BufferSendf( &(cp->rsp.head)
											,"HTTP/1.0 200 OK\r\n"
											"Content-Type: text/html\r\n"
											"Content-Length: %u\r\n"
											,GetFileSize(cp->rsp.readfh,NULL)
									);
								}
								else ResponseError(cp,"404 Not Found");
								goto send_ready;
							}
							else if( stricmp(file,":logout")==0 ){
								if( cp->session ){
									BufferSends( &(cp->rsp.body) ,cp->session->id );
									BufferSendf( &(cp->rsp.head)
										,"HTTP/1.0 200 OK\r\n"
										"Content-Type: text/plain\r\n"
										"Content-Length: %u\r\n"
										,cp->rsp.body.bytes
									);
									LogA("[%u]ログアウト(%s)",Num(cp),cp->session->id);
									SessionRemove( cp->session );
									cp->session = NULL;
								}
								else ResponseError(cp,"500 Internal Server Error");
								goto send_ready;
							}
							// 通常処理へ
						}
						else{
							// セッションなし
							if( stricmp(req->method,"GET")==0 ){
								if( !*file || stricmp(FileContentTypeA(file),"text/html")==0 ){
									// リダイレクトは使わず直接login.htmlを返却する。
									cp->rsp.readfh = CreateFileW(
											RealPath("login.html",realpath,sizeof(realpath)/sizeof(WCHAR))
											,GENERIC_READ ,FILE_SHARE_READ ,NULL
											,OPEN_EXISTING ,FILE_ATTRIBUTE_NORMAL ,NULL
									);
									if( cp->rsp.readfh !=INVALID_HANDLE_VALUE ){
										BufferSendf( &(cp->rsp.head)
												,"HTTP/1.0 200 OK\r\n"
												"Content-Type: text/html\r\n"
												"Content-Length: %u\r\n"
												,GetFileSize(cp->rsp.readfh,NULL)
										);
									}
									else ResponseError(cp,"404 Not Found");
								}
								else ResponseError(cp,"403 Forbidden");
								goto send_ready;
							}
							else if( stricmp(req->method,"POST")==0 ){
								if( stricmp(file,":login")==0 && req->ContentLength && req->ContentLength <999 ){
									// ログイン処理
									#define BODYBYTES(r) ((r)->bytes - ((r)->body - (r)->buf))
									if( BODYBYTES(req) >= req->ContentLength ){
										// 本文受信完了
										cp->status = CLIENT_THREADING;
										cp->thread = (HANDLE)_beginthreadex( NULL,0 ,authenticate ,(void*)cp ,0,NULL );
									}
									else{
									recv_more: // 引き続き受信
										cp->status = CLIENT_RECV_MORE;
										// なぜかSSLでFD_READ来ないので自力発行(特にPUT/POSTで)
										//if( SSL_pending(cp->sslp) )
										if( cp->sslp )
											PostMessage( MainForm, WM_SOCKET, (WPARAM)sock, (LPARAM)FD_READ );
									}
									break;
								}
								else{ ResponseError(cp,"400 Bad Request"); goto send_ready; }
							}
							else{ ResponseError(cp,"400 Bad Request"); goto send_ready; }
						}
					}
					if( stricmp(req->method,"GET")==0 ){
						if( stricmp(file,":browser.json")==0 ){
							// index.htmlサイドバーブラウザアイコン不要なものを隠すための情報。
							//   {"chrome":0,"firefox":0,"ie":0,"opera":0}
							// クライアントでindex.html受信後にajaxでこれを取得して非表示にしているが、
							// そもそもサーバから返す時にHTML加工してしまう方が無駄がないような…。
							// それを言ってしまうとtree.jsonもサーバ側でHTMLにした方が無駄がない…。
							Buffer* bp = &(cp->rsp.body);
							UINT count=0;
							BufferSend( bp ,"{" ,1 );
							if( browser ){
								if( browser[BI_IE].hwnd ){
									count++;
									BufferSends( bp ,"\"ie\":1" );
								}
								if( browser[BI_CHROME].hwnd ){
									if( count++ ) BufferSend( bp ,"," ,1 );
									BufferSends( bp ,"\"chrome\":1" );
								}
								if( browser[BI_FIREFOX].hwnd ){
									if( count++ ) BufferSend( bp ,"," ,1 );
									BufferSends( bp ,"\"firefox\":1" );
								}
								if( browser[BI_OPERA].hwnd ){
									if( count++ ) BufferSend( bp ,"," ,1 );
									BufferSends( bp ,"\"opera\":1" );
								}
							}
							BufferSend( bp ,"}" ,1 );
							BufferSendf( &(cp->rsp.head)
									,"HTTP/1.0 200 OK\r\n"
									"Content-Type: application/json\r\n"
									"Content-Length: %u\r\n"
									,bp->bytes
							);
							goto send_ready;
						}
						else if( stricmp(file,":clipboard.txt")==0 ){
							// クリップボードテキスト取得
							if( ClientIsLocal( cp ) ){
								WCHAR* u16 = NULL;
								if( OpenClipboard(MainForm) ){
									HGLOBAL cb = GetClipboardData( CF_UNICODETEXT );
									if( cb ){
										u16 = malloc( GlobalSize(cb) );
										if( u16 ){
											WCHAR* p = GlobalLock(cb);
											if( p ){
												wcscpy( u16, p );
												GlobalUnlock(cb);
											}
											else LogW(L"[%u]GlobalLockエラー%u",Num(cp),GetLastError());
										}
										else LogW(L"L%u:malloc(%u)エラー",__LINE__,GlobalSize(cb));
									}
									CloseClipboard();
								}
								else LogW(L"[%u]OpenClipboardエラー%u",Num(cp),GetLastError());
								// 返却
								if( u16 ){
									UCHAR* u8 = WideCharToUTF8alloc( u16 ); free(u16), u16=NULL;
									if( u8 ){
										BufferSends( &(cp->rsp.body) ,u8 );
										BufferSendf( &(cp->rsp.head)
												,"HTTP/1.0 200 OK\r\n"
												"Content-Type: text/plain; charset=utf-8\r\n"
												"Content-Length: %u\r\n"
												,cp->rsp.body.bytes
										);
										free( u8 );
									}
									else ResponseError(cp,"500 Internal Server Error");
								}
								else ResponseError(cp,"404 Not Found");
							}
							else ResponseError(cp,"403 Forbidden");
							goto send_ready;
						}
						else if( stricmp(file,":snapshot")==0 ){
							// スナップショット作成
							// ファイル名に年月日時分秒ミリ秒のタイムスタンプをつけて作成。
							// 重複ファイル名はエラーすなわちGetLocalTimeが進まないほど短時間の
							// リクエストがあった場合はエラーになる。
							// ※重複排他はPathFileExistsで行なっている。その後のFCICreate内の
							// CreateFileはCREATE_ALWAYSで上書きオープンのため、実はPathFileExists
							// とCreateFileの間で別スレッド・プロセスがファイルを作った場合は
							// エラーにならず既存ファイルを上書きする。すなわちスレッド・プロセス
							// 並列動作での排他はできない程度の実装。シングルスレッド内の排他。
							// FCICreateのCreateFileをCREATE_NEWで実行できればもうちょっとマシな
							// 排他になるが、FCIの一時ファイルエラーの問題も発生するためひとまず
							// PathFileExistsを使っておく軟弱仕様。
							BOOL success = FALSE;
							UINT count = 2;
							WCHAR* path[2];
							path[0] = wcsjoin( DocumentRoot, L"\\tree.json", 0,0,0 );
							path[1] = wcsjoin( DocumentRoot, L"\\index.json", 0,0,0 );
							if( path[0] && path[1] ){
								WCHAR stamp[32];
								WCHAR* wcab;
								SYSTEMTIME st;
								// index.jsonは存在しない場合
								if( !PathFileExistsW( path[1] ) ){
									free(path[1]), path[1]=NULL;
									count = 1;
								}
								GetLocalTime( &st );
								_snwprintf( stamp,sizeof(stamp)
											,L"%04u%02u%02u-%02u%02u%02u-%03u"
											,st.wYear, st.wMonth, st.wDay
											,st.wHour, st.wMinute, st.wSecond, st.wMilliseconds
								);
								wcab = wcsjoin( DocumentRoot, L"\\snap\\shot", stamp, L".cab", 0 );
								if( wcab ){
									if( PathFileExistsW(wcab) ){
										LogW(L"[%u]ファイル重複: %s",Num(cp),wcab);
									}
									else if( cabCompress( wcab, count, path, NULL ) ){
										LogW(L"[%u]スナップショット作成: %s",Num(cp),wcab);
										success = TRUE;
									}
									free( wcab );
								}
							}
							if( path[0] ) free( path[0] );
							if( path[1] ) free( path[1] );
							if( success ) goto shotlist; // 成功→作成済みスナップショット一覧返却
							LogW(L"[%u]スナップショット作成エラー",Num(cp));
							ResponseError(cp,"500 Internal Server Error");
							goto send_ready;
						}
						else if( stricmp(file,":shotlist")==0 ){
							// 作成済みスナップショット一覧
							BOOL err;
							WCHAR* wfind;
						shotlist:
							err = FALSE;
							wfind = wcsjoin( DocumentRoot, L"\\snap\\shot*.cab", 0,0,0 );
							if( wfind ){
								WIN32_FIND_DATAW wfd;
								HANDLE hFind = FindFirstFileW( wfind, &wfd );
								Buffer* bp = &(cp->rsp.body);
								BufferSend( bp ,"[" ,1 );
								if( hFind !=INVALID_HANDLE_VALUE ){
									UINT count=0;
									do{
										WCHAR* wtxt = wcsjoin( DocumentRoot, L"\\snap\\", wfd.cFileName, 0,0 );
										UCHAR* u8name = WideCharToUTF8alloc( wfd.cFileName );
										if( wtxt && u8name ){
											// メモファイルは.cabと同名の拡張子.txtファイル
											wcscpy( wtxt +wcslen(wtxt) -3, L"txt" );
											BufferSendf( bp
													,"%s{"
													"\"id\":\"%s\""
													",\"date\":%I64u"
													",\"memo\":\""
													,count++? "," : ""
													,u8name
													,FileTimeToJSTime( &wfd.ftLastWriteTime )
											);
											if( PathFileExistsW(wtxt) ) BufferSendFile( bp ,wtxt );
											BufferSend( bp ,"\"}" ,2 );
										}
										else err = TRUE;
										if( wtxt ) free( wtxt );
										if( u8name ) free( u8name );
										if( err ) break;
									}
									while( FindNextFileW( hFind, &wfd ) );
									FindClose( hFind );
								}
								else LogW(L"[%u]FindFirstFileW(%s)エラー%u",Num(cp),wfind,GetLastError());
								free( wfind );
								BufferSend( bp ,"]" ,1 );
								BufferSendf( &(cp->rsp.head)
										,"HTTP/1.0 200 OK\r\n"
										"Content-Type: application/json\r\n"
										"Content-Length: %u\r\n"
										,bp->bytes
								);
							}
							else ResponseError(cp,"500 Internal Server Error");
							if( err ){
								ResponseEmpty(cp);
								ResponseError(cp,"500 Internal Server Error");
							}
							goto send_ready;
						}
						else if( stricmp(file,":shotdel")==0 && cp->req.param ){
							// スナップショット削除 /:shotdel?CABファイル名
							// 一覧を返却するのでエラー応答は返さない。
							WCHAR* wname = MultiByteToWideCharAlloc( cp->req.param, CP_UTF8 );
							if( wname ){
								WCHAR* wpath = wcsjoin( DocumentRoot, L"\\snap\\", wname, 0,0 );
								if( wpath ){
									WCHAR* bak;
									// .cab削除
									if( DeleteFileW( wpath ) ) LogW(L"[%u]削除 %s",Num(cp),wpath);
									// .txt削除
									wcscpy( wpath +wcslen(wpath) -3, L"txt" );
									if( DeleteFileW( wpath ) ) LogW(L"[%u]削除 %s",Num(cp),wpath);
									// .txt.bak削除
									bak = wcsjoin( wpath, L".bak", 0,0,0 );
									if( bak ){
										if( DeleteFileW( bak ) ) LogW(L"[%u]削除 %s",Num(cp),bak);
										free( bak );
									}
									free( wpath );
								}
								free( wname );
							}
							goto shotlist;
						}
						else if( stricmp(file,":shotget")==0 && cp->req.param ){
							// スナップショット展開取得
							BOOL success = FALSE;
							WCHAR* wname = MultiByteToWideCharAlloc( cp->req.param, CP_UTF8 );
							if( wname ){
								WCHAR* wcab = wcsjoin( DocumentRoot, L"\\snap\\", wname, 0,0 );
								WCHAR* wdir = wcsjoin( DocumentRoot, L"\\snap", 0,0,0 );
								if( wcab && wdir ){
									// TODO:展開処理だけでは展開ファイルパスがわからないので
									// 無条件に index.json と tree.json を返却して削除しているが、
									// 展開処理で作ったファイルを削除する実装にしないとなんか怖い。
									WCHAR* index = wcsjoin( wdir, L"\\index.json", 0,0,0 );
									WCHAR* tree = wcsjoin( wdir, L"\\tree.json", 0,0,0 );
									if( index && tree ){
										if( cabDecomp( wcab, wdir ) ){
											Buffer* bp = &(cp->rsp.body);
											BufferSends( bp ,"{\"tree.json\":" );
											BufferSendFile( bp ,tree );
											if( PathFileExistsW(index) ){
												BufferSends( bp ,",\"index.json\":" );
												BufferSendFile( bp ,index );
											}
											BufferSend( bp ,"}" ,1 );
											BufferSendf( &(cp->rsp.head)
													,"HTTP/1.0 200 OK\r\n"
													"Content-Type: application/json\r\n"
													"Content-Length: %u\r\n"
													,bp->bytes
											);
											success = TRUE;
										}
										if( DeleteFileW(index) ) LogW(L"[%u]削除 %s",Num(cp),index);
										if( DeleteFileW(tree) ) LogW(L"[%u]削除 %s",Num(cp),tree);
									}
									if( index ) free( index );
									if( tree ) free( tree );
								}
								if( wcab ) free( wcab );
								if( wdir ) free( wdir );
								free( wname );
							}
							if( !success ){
								ResponseEmpty(cp);
								ResponseError(cp,"500 Internal Server Error");
							}
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
												,GENERIC_READ ,FILE_SHARE_READ
												,NULL ,OPEN_EXISTING ,FILE_ATTRIBUTE_NORMAL ,NULL
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
													,GENERIC_READ ,FILE_SHARE_READ
													,NULL ,OPEN_EXISTING ,FILE_ATTRIBUTE_NORMAL ,NULL
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
							// TODO:Chromeでブックマーク整理した後はDB開けないもよう。Chrome終了で開けるようになた。
							// sqlite3_open_v2()のREADONLY指定で開けるかどうか…しかしパス名がUTF-8じゃないとダメ。
							// sqlite3_open16_v2()はなぜ存在しないのか？
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
													,GENERIC_READ ,FILE_SHARE_READ
													,NULL ,OPEN_EXISTING ,FILE_ATTRIBUTE_NORMAL ,NULL
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
										,GENERIC_READ ,FILE_SHARE_READ
										,NULL ,OPEN_EXISTING ,FILE_ATTRIBUTE_NORMAL ,NULL
								);
								if( cp->rsp.readfh==INVALID_HANDLE_VALUE && PathIsDirectoryW(realpath) ){
									// フォルダだった場合 index.html 補完
									// TODO:MAX_PATH(260)を超えるにはGetFileAttributesで接頭詞"\\?\"
									LogW(L"CreateFile %u",GetLastError());
									_snwprintf(realpath+len,sizeof(realpath)/sizeof(WCHAR)-len,L"\\%s",L"index.html");
									realpath[sizeof(realpath)/sizeof(WCHAR)-1]=L'\0';
									cp->rsp.readfh = CreateFileW( realpath
											,GENERIC_READ ,FILE_SHARE_READ
											,NULL ,OPEN_EXISTING ,FILE_ATTRIBUTE_NORMAL ,NULL
									);
								}
							}
						}
						if( cp->rsp.readfh !=INVALID_HANDLE_VALUE ){
							FILETIME ft;
							SYSTEMTIME st;
							UCHAR inetTime[INTERNET_RFC1123_BUFSIZE];
							Buffer* bp = &(cp->rsp.head);
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
									BufferSends( bp ,"HTTP/1.0 304 Not Modified\r\n" );
									// ファイル中身送らない
									CloseHandle( cp->rsp.readfh );
									cp->rsp.readfh = INVALID_HANDLE_VALUE;
								}
								else goto _200_ok;
							}
							else{
							_200_ok:
								// TODO:Content-Encoding:gzip送信するとインターネット経由でレスポンス改善？
								BufferSendf( bp
										,"HTTP/1.0 200 OK\r\n"
										"Content-Length: %u\r\n"
										,GetFileSize(cp->rsp.readfh,NULL)
								);
								if( stricmp(file,"export.html")==0 ){
									// エクスポートHTMLは特別扱い
									// Chrome,Firefoxでは octet-stream にするだけで保存ダイアログ出たけど
									// IE8は出てくれない。しょうがなくContent-Dispositionもつける。
									BufferSends( bp
											,"Content-Type: application/octet-stream\r\n"
											"Content-Disposition: attachment; filename=\"bookmark.html\"\r\n"
									);
								}
								else{
									BufferSendf( bp
											,"Content-Type: %s\r\n"
											,(*realpath)? FileContentTypeW(realpath) : FileContentTypeA(file)
									);
								}
								BufferSendf( bp ,"Last-Modified: %s\r\n" ,inetTime );
							}
							GetSystemTime( &st );
							InternetTimeFromSystemTimeA(&st,INTERNET_RFC1123_FORMAT,inetTime,sizeof(inetTime));
							BufferSendf( bp ,"Date: %s\r\n" ,inetTime );
						}
						else ResponseError(cp,"404 Not Found");
						goto send_ready;
					}
					else if( stricmp(req->method,"POST")==0 ){
						if( req->ContentLength ){
							if( stricmp(file,":analyze")==0 ){
								if( BODYBYTES(req) >= req->ContentLength ){
									// 本文受信完了(1行1URL)
									cp->status = CLIENT_THREADING;
									cp->thread = (HANDLE)_beginthreadex( NULL,0 ,analyzer ,(void*)cp ,0,NULL );
								}
								else goto recv_more;
							}
							else if( stricmp(file,":poke")==0 ){
								if( BODYBYTES(req) >= req->ContentLength ){
									// 本文受信完了(1行1URL)
									cp->status = CLIENT_THREADING;
									cp->thread = (HANDLE)_beginthreadex( NULL,0 ,poker ,(void*)cp ,0,NULL );
								}
								else goto recv_more;
							}
							else{
								// HTMLインポート:リクエスト本文を一時ファイルに書き出す
								// TODO:PUTとおなじ処理になっとる
								ClientTempPath(cp,tmppath,sizeof(tmppath)/sizeof(WCHAR));
								if( req->writefh==INVALID_HANDLE_VALUE ){
									req->writefh = CreateFileW( tmppath
														,GENERIC_WRITE, FILE_SHARE_READ, NULL
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
										ResponseError(cp,"500 Internal Server Error");
										goto send_ready;
									}
								}
								if( req->writefh !=INVALID_HANDLE_VALUE ){
									// Content-Lengthバイトぶんファイル出力
									DWORD bodybytes = BODYBYTES(req);
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
										if( req->ContentType ){
											if( strnicmp(req->ContentType,"multipart/form-data;",20)==0 )
												MultipartFormdataProc( cp, tmppath );
											else
												ResponseError(cp,"501 Not Implemented");
										}
										else ResponseError(cp,"501 Not Implemented");
										goto send_ready;
									}
									else goto recv_more;
								}
							}
						}
						else{ ResponseError(cp,"400 Bad Request"); goto send_ready; }
					}
					else if( stricmp(req->method,"PUT")==0 ){
						if( req->ContentLength ){
							RealPath( file, realpath, sizeof(realpath)/sizeof(WCHAR) );
							// リクエスト本文を一時ファイルに書き出す
							// TODO:POSTとおなじ処理になっとる
							// TODO:保存を連打して異常系を試すとかなり稀に落ちる＋tree.json破損する場合がある原因不明
							// デバッグトレースもVEC_memcpyとかfastcopy_IとかOS側で落ちているのを1度だけ補足できたのみ
							ClientTempPath( cp, tmppath, sizeof(tmppath)/sizeof(WCHAR) );
							if( req->writefh==INVALID_HANDLE_VALUE ){
								UCHAR* ext = strrchr(file,'.');
								// ドキュメントルート配下のJSONまたはexport.htmlまたはスナップショットメモのみ
								if( (ext && stricmp(ext,".json")==0 && UnderDocumentRoot(realpath))
									|| stricmp(file,"export.html")==0
									|| (strnicmp(file,"snap/shot",4)==0 && stricmp(file+strlen(file)-4,".txt")==0 )
								){
									req->writefh = CreateFileW( tmppath
														,GENERIC_WRITE, FILE_SHARE_READ, NULL
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
										ResponseError(cp,"500 Internal Server Error");
										goto send_ready;
									}
								}
								else{
									LogA("[%u]PUTファイル名不正:%s",Num(cp),req->path);
									ResponseError(cp,"400 Bad Request");
									goto send_ready;
								}
							}
							if( req->writefh !=INVALID_HANDLE_VALUE ){
								// リクエスト本文をContent-Lengthバイトぶんファイル出力
								DWORD bodybytes = BODYBYTES(req);
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
											ResponseError(cp,"200 OK");
										}
										else{
											LogW(L"[%u]MoveFileEx(%s)エラー%u",Num(cp),tmppath,GetLastError());
											ResponseError(cp,"500 Internal Server Error");
										}
									}
									else ResponseError(cp,"500 Internal Server Error");
									goto send_ready;
								}
								else goto recv_more;
							}
						}
						else{
							// TODO:Content-Length:0もここでエラーになる。スナップショットメモで問題に
							// なったが、とりあえずDELリクエストに変更した。しかし「空のファイルをPUT」
							// 動作ができない仕様なのは後々また問題になることがあるか？
							LogW(L"[%u]PUTでContent-Lengthなし未対応",Num(cp));
							ResponseError(cp,"501 Not Implemented");
							goto send_ready;
						}
					}
					else if( stricmp(req->method,"DEL")==0 ){
						// スナップショットメモのみ
						if( strnicmp(file,"snap/shot",4)==0 && stricmp(file+strlen(file)-4,".txt")==0 ){
							RealPath( file, realpath, sizeof(realpath)/sizeof(WCHAR) );
							DeleteFileW( realpath );
							ResponseError(cp,"200 OK");
						}
						else ResponseError(cp,"400 Bad Request");
						goto send_ready;
					}
					else{ ResponseError(cp,"400 Bad Request"); goto send_ready; }
				}
				else{ ResponseError(cp,"400 Bad Request"); goto send_ready; }
			}
			break;

		//default: if( !cp->sslp ) LogW(L"[%u](FD_READ)",Num(cp));
		}
		cp->silent = 0;
	}
	//else LogW(L"[:%u](FD_READ)",sock);	// SSLで多発うざい
}

void ClientWrite( TClient* cp )
{
	Response* rsp = &(cp->rsp);
	switch( cp->status ){
	case CLIENT_SEND_READY:
		// 共通レスポンスヘッダ
		if( cp->session ){
			BufferSendf( &(rsp->head) ,"Set-Cookie: session=%s; path=/\r\n" ,cp->session->id );
		}
		BufferSendf( &(rsp->head)
				,"Connection: %s\r\n"
				"\r\n"
#ifdef HTTP_KEEPALIVE
				,cp->req.KeepAlive? "keep-alive" :"close"
#else
				,"close"
#endif
		);
		// 送信準備完了,この時点で送信バッファはテキスト情報のみ(後になるとバイナリも入る)
		LogA("[%u]送信:%s",Num(cp),rsp->head.top);
		rsp->sended = rsp->readed = 0;
		cp->status = CLIENT_SENDING;

	case CLIENT_SENDING:
		if( rsp->sended < rsp->head.bytes + rsp->body.bytes ){
			// まず送信バッファ(ヘッダ＋ボディ)を送る
			Buffer* bp;
			UINT sended;
			int ret;
			if( rsp->sended < rsp->head.bytes ){
				bp = &(rsp->head);
				sended = rsp->sended;
			}
			else{
				bp = &(rsp->body);
				sended = rsp->sended - rsp->head.bytes;
			}
			if( cp->sslp ){
				ret = SSL_write( cp->sslp, bp->top + sended, bp->bytes - sended );
				if( ret<=0 ){
					int err = SSL_get_error( cp->sslp, ret );
					switch( err ){
					case SSL_ERROR_WANT_READ:
					case SSL_ERROR_WANT_WRITE:
						// SSL_writeリトライ再度FD_WRITEが来る(？)のを待つ
						break;
					default:
						LogW(L"[%u]SSL_write不明なエラー%d",Num(cp),err);
						PostMessage( MainForm, WM_SOCKET, (WPARAM)cp->sock, (LPARAM)FD_CLOSE );
					}
					break;
				}
			}
			else{
				ret = send( cp->sock, bp->top + sended, bp->bytes - sended, 0 );
				if( ret==SOCKET_ERROR ){
					ret = WSAGetLastError();
					if( ret !=WSAEWOULDBLOCK ) // 頻発するので記録しない
						LogW(L"[%u]sendエラー%u",Num(cp),ret);
					// 送信中止、再度FD_WRITEが来る(はず？)のを待つ
					break;
				}
			}
			rsp->sended += ret;
			// 送信継続
			PostMessage( MainForm, WM_SOCKET, (WPARAM)cp->sock, (LPARAM)FD_WRITE );
		}
		else if( rsp->readfh != INVALID_HANDLE_VALUE ){
			// 送信バッファ送ったらファイルを…
			if( rsp->readed < GetFileSize(rsp->readfh,NULL) ){
				// 送信バッファに読み込んで(上書き)
				DWORD bRead=0;
				if( ReadFile( rsp->readfh, rsp->body.top, rsp->body.size, &bRead, NULL )==0 )
					LogW(L"L%u:ReadFileエラー%u",__LINE__,GetLastError());
				rsp->readed += bRead;
				rsp->body.bytes = bRead;
				rsp->sended = rsp->head.bytes;
			}
			else{
				// ファイルデータ全部送った
				CloseHandle( rsp->readfh );
				rsp->readfh = INVALID_HANDLE_VALUE;
			}
			// 送信継続
			PostMessage( MainForm, WM_SOCKET, (WPARAM)cp->sock, (LPARAM)FD_WRITE );
		}
		else{
			// ぜんぶ送信した
#ifdef HTTP_KEEPALIVE
			if( cp->req.KeepAlive ){ // HTTP1.0持続的接続
				SOCKET	sock		= cp->sock;
				SSL*	sslp		= cp->sslp;
				UCHAR	loopback	= cp->loopback;
				UCHAR*	reqBuf		= cp->req.buf;
				UCHAR*	rspHead		= cp->rsp.head.top;
				UCHAR*	rspBody		= cp->rsp.body.top;
				size_t	reqBufSize	= cp->req.bufsize;
				size_t	rspHeadSize	= cp->rsp.head.size;
				size_t	rspBodySize	= cp->rsp.body.size;
				WCHAR	wpath[MAX_PATH+1]=L"";
				CloseHandle( cp->thread );
				CloseHandle( cp->req.writefh );
				CloseHandle( cp->rsp.readfh );
				DeleteFileW( ClientTempPath(cp,wpath,sizeof(wpath)/sizeof(WCHAR)) );
				memset( cp->req.buf ,0 ,cp->req.bufsize );
				memset( cp->rsp.head.top ,0 ,cp->rsp.head.size );
				memset( cp->rsp.body.top ,0 ,cp->rsp.body.size );
				memset( cp ,0 ,sizeof(TClient) );
				cp->sock			= sock;
				cp->sslp			= sslp;
				cp->loopback		= loopback;
				cp->req.buf			= reqBuf;
				cp->req.bufsize		= reqBufSize;
				cp->rsp.head.top	= rspHead;
				cp->rsp.body.top	= rspBody;
				cp->rsp.head.size	= rspHeadSize;
				cp->rsp.body.size	= rspBodySize;
				cp->rsp.readfh		= INVALID_HANDLE_VALUE;
				cp->req.writefh		= INVALID_HANDLE_VALUE;
				cp->status			= CLIENT_KEEP_ALIVE;
				//LogW(L"[%u]再度クライアント要求を待ちます",Num(cp));
			}
			else{ // 切断
#endif
				cp->status = 0;
				PostMessage( MainForm, WM_SOCKET, (WPARAM)cp->sock, (LPARAM)FD_CLOSE );
#ifdef HTTP_KEEPALIVE
			}
#endif
		}
		break;
	//default: if( !cp->sslp ) LogW(L"[%u](FD_WRITE)",Num(cp));
	}
	cp->silent = 0;
}
void SocketWrite( SOCKET sock )
{
	TClient* cp = ClientOfSocket( sock );
	if( cp ) ClientWrite( cp );
	//else LogW(L"[:%u](FD_WRITE)",sock);	// SSLで多発うざい
}

void SocketClose( SOCKET sock )
{
	TClient* cp = ClientOfSocket( sock );
	if( cp ){
		if( cp->status==CLIENT_THREADING ){
			// スレッド終了待たないとアクセス違反で落ちる
			cp->abort = 1;
			LogW(L"[%u]スレッド実行中待機...",Num(cp));
			Sleep(300);
			// もう一回おなじメッセージでこの関数を実行
			PostMessage( MainForm, WM_SOCKET, (WPARAM)sock, (LPARAM)FD_CLOSE );
			return;
		}
		LogW(L"[%u]切断",Num(cp));
		ClientShutdown( cp );
	}
	else{
		LogW(L"[:%u]切断(FD_CLOSE)",sock);
		SocketBlocking( sock );
		shutdown( sock, SD_BOTH );
		closesocket( sock );
	}
}

void SocketShutdown( void )
{
	BOOL retry;
	UINT i; //,count=0;

	if( ListenSock1 !=INVALID_SOCKET ){
		LogW(L"[%u]待機終了",ListenSock1);
		shutdown( ListenSock1, SD_BOTH );
		closesocket( ListenSock1 );
		ListenSock1 = INVALID_SOCKET;
	}
	if( ListenSock2 !=INVALID_SOCKET ){
		LogW(L"[%u]待機終了",ListenSock2);
		shutdown( ListenSock2, SD_BOTH );
		closesocket( ListenSock2 );
		ListenSock2 = INVALID_SOCKET;
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
		// 数秒以内にスレッドは終了するはずだが・・・
		Sleep(500);
		goto retry;
	}
}











//---------------------------------------------------------------------------------------------------------------
// 設定ダイアログ
//
WCHAR* WindowTextAllocW( HWND hwnd )
{
	int len = GetWindowTextLengthW( hwnd ) + 1;
	WCHAR* text = malloc( len * sizeof(WCHAR) );
	if( text ) GetWindowTextW( hwnd, text, len );
	else LogW(L"L%u:malloc(%u)エラー",__LINE__,len*sizeof(WCHAR));
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
// SSL自己署名サーバ証明書・秘密鍵作成
// TODO:証明書を見るで確認すると「拇印アルゴリズム:sha1」だが、それを設定するのはどこ？
BOOL SSL_SelfCertCreate( const WCHAR* crtfile, const WCHAR* keyfile )
{
	ASN1_INTEGER*	serial	= ASN1_INTEGER_new();
	EVP_PKEY*		pkey	= EVP_PKEY_new();
	BIGNUM*			exp		= BN_new();
	BIGNUM*			big		= BN_new();
	X509*			x509	= X509_new();
	RSA*			rsa		= RSA_new();
	X509_NAME*		name	= NULL;
	FILE*			fp		= NULL;
	BOOL			success	= FALSE;

	LogW(L"SSL自己署名証明書を作成します...");

	if( !serial ){ LogW(L"ASN1_INTEGER_newエラー"); goto fin; }
	if( !pkey ){ LogW(L"EVP_PKEY_newエラー"); goto fin; }
	if( !exp ){ LogW(L"BN_newエラー"); goto fin; }
	if( !big ){ LogW(L"BN_newエラー"); goto fin; }
	if( !x509 ){ LogW(L"X509_newエラー"); goto fin; }
	if( !rsa ){ LogW(L"RSA_newエラー"); goto fin; }

	// openssl-1.0.0j/apps/genrsa.c
	LogW(L"BN_set_word(RSA_F4)..");
	if( !BN_set_word( exp ,RSA_F4 ) ){
		LogW(L"BN_set_wordエラー");
		goto fin;
	}
	#define RSAKEY_LEN 2048 // 鍵長2048bit
	LogW(L"RSA_generate_key(%u)..",RSAKEY_LEN);
	if( RSA_generate_key_ex( rsa ,RSAKEY_LEN ,exp ,NULL ) !=1 ){
		LogW(L"RSA_generate_key_exエラー");
		goto fin;
	}
	// openssl-1.0.0j/apps/x509.c
	// openssl-1.0.0j/apps/apps.c:int rand_serial(BIGNUM *b, ASN1_INTEGER *ai)
	#define SERIAL_RAND_BITS 64
	LogW(L"BN_pseudo_rand(%u)..",SERIAL_RAND_BITS);
	if( !BN_pseudo_rand( big ,SERIAL_RAND_BITS ,0,0 ) ){
		LogW(L"BN_pseudo_randエラー");
		goto fin;
	}
	LogW(L"BN_to_ASN1_INTEGER..");
	if( !BN_to_ASN1_INTEGER( big ,serial ) ){
		LogW(L"BN_pseudo_randエラー");
		goto fin;
	}
	LogW(L"X509_set_serialNumber..");
	if( !X509_set_serialNumber( x509 ,serial ) ){
		LogW(L"X509_set_serialNumberエラー");
		goto fin;
	}
	// openssl-1.0.0j/demos/selfsign.c
	LogW(L"EVP_PKEY_assign_RSA..");
	if( !EVP_PKEY_assign_RSA( pkey ,rsa ) ){
		LogW(L"EVP_PKEY_assign_RSAエラー");
		goto fin;
	}
	rsa = NULL;
	LogW(L"X509_set_version(2)..");
	X509_set_version( x509 ,2 ); // 2 -> x509v3

	#define SSL_CERT_DAYS 3650
	LogW(L"X509_gmtime_adj(60*60*24*%u)..",SSL_CERT_DAYS);
	if( !X509_gmtime_adj( X509_get_notBefore(x509) ,0 ) ||
		!X509_gmtime_adj( X509_get_notAfter(x509) ,60*60*24*SSL_CERT_DAYS )
	){
		LogW(L"X509_gmtime_adjエラー");
		goto fin;
	}
	LogW(L"X509_set_pubkey..");
	if( !X509_set_pubkey( x509 ,pkey ) ){
		LogW(L"X509_set_pubkeyエラー");
		goto fin;
	}
	// 自己署名
	name = X509_get_subject_name( x509 );
	if( !name ){
		LogW(L"X509_get_subject_nameエラー");
		goto fin;
	}
	LogW(L"X509_NAME_add_entry(C=JP,CN=JCBookmark)..");
	if( !X509_NAME_add_entry_by_txt(name,"C",MBSTRING_ASC,"JP",-1,-1,0) ||
		!X509_NAME_add_entry_by_txt(name,"CN",MBSTRING_ASC,"JCBookmark",-1,-1,0)
	){
		LogW(L"X509_NAME_add_entry_by_txtエラー");
		goto fin;
	}
	LogW(L"X509_set_issuer_name..");
	if( !X509_set_issuer_name( x509 ,name ) ){
		LogW(L"X509_set_issuer_nameエラー");
		goto fin;
	}
	LogW(L"X509_sign(sha256)..");
	if( !X509_sign( x509 ,pkey ,EVP_sha256() ) ){
		LogW(L"X509_signエラー");
		goto fin;
	}
	LogW(L"証明書をファイルに保存..");
	fp = _wfopen( crtfile ,L"wb" );
	if( fp ){
		PEM_write_X509( fp ,x509 );
		fclose( fp );
	}
	else{
		LogW(L"fopen(%s)エラー",crtfile);
		goto fin;
	}
	LogW(L"秘密鍵をファイルに保存..");
	fp = _wfopen( keyfile, L"wb" );
	if( fp ){
		PEM_write_PrivateKey( fp ,pkey ,NULL,NULL,0,NULL,NULL );
		fclose( fp );
	}
	else{
		LogW(L"fopen(%s)エラー",keyfile);
		goto fin;
	}
	LogW(L"証明書:%s",crtfile);
	LogW(L"秘密鍵:%s",keyfile);
	success = TRUE;
 fin:
	if( serial ) ASN1_INTEGER_free( serial );
	if( pkey ) EVP_PKEY_free( pkey );
	if( x509 ) X509_free( x509 );
	if( rsa ) RSA_free( rsa );
	if( exp ) BN_free( exp );
	if( big ) BN_free( big );
	return success;
}
// SSL証明書ファイルを読み込んでSSLコンテキストに登録
void SSL_CTX_UseCertificate( const WCHAR* crtfile, const WCHAR* keyfile )
{
	FILE* fp = _wfopen( crtfile ,L"rb" );
	if( fp ){
		X509* x509 = PEM_read_X509( fp ,NULL,NULL,NULL );
		fclose( fp );
		if( x509 ){
			if( SSL_CTX_use_certificate( ssl_ctx ,x509 )==1 ){
				UCHAR buf[256];
				BIO* bio = BIO_new( BIO_s_mem() );
				LogW(L"SSLサーバ証明書");
				X509_NAME_oneline( X509_get_subject_name(x509) ,buf ,sizeof(buf) );
				buf[sizeof(buf)-1]='\0'; LogA("所有者:%s",buf);
				X509_NAME_oneline( X509_get_issuer_name(x509) ,buf ,sizeof(buf) );
				buf[sizeof(buf)-1]='\0'; LogA("発行者:%s",buf);
				// http://stackoverflow.com/questions/11683021/openssl-c-get-expiry-date
				if( bio ){
					int bytes;
					if( ASN1_TIME_print( bio ,X509_get_notBefore(x509) ) ){
						*buf='\0'; bytes = BIO_read( bio ,buf ,sizeof(buf) );
						buf[bytes]='\0'; LogA("有効期間開始: %s",buf);
					}
					if( ASN1_TIME_print( bio ,X509_get_notAfter(x509) ) ){
						*buf='\0'; bytes = BIO_read( bio ,buf ,sizeof(buf) );
						buf[bytes]='\0'; LogA("有効期間終了: %s",buf);
					}
					BIO_free( bio );
				}
				else LogW(L"BIO_newエラー");
			}
			else LogW(L"SSL_CTX_use_certificateエラー");
			X509_free( x509 );
		}
		else LogW(L"PEM_read_X509エラー");
	}
	else LogW(L"fopen(%s)エラー",crtfile);

	fp = _wfopen( keyfile ,L"rb" );
	if( fp ){
		EVP_PKEY* pkey = PEM_read_PrivateKey( fp ,NULL,NULL,NULL );
		fclose( fp );
		if( pkey ){
			if( SSL_CTX_use_PrivateKey( ssl_ctx ,pkey ) !=1 ){
				LogW(L"SSL_CTX_use_PrivateKeyエラー");
			}
			EVP_PKEY_free( pkey );
		}
	}
	else LogW(L"fopen(%s)エラー",keyfile);
}
// 証明書ファイルが新しかったら読み込む
#define SSL_CRT L"ssl.crt"
#define SSL_KEY L"ssl.key"
void SSL_CertLoad( void )
{
	static FILETIME lastWrite = {0};

	if( HttpsRemote || HttpsLocal ){
		WCHAR* crtfile = AppFilePath( SSL_CRT );
		WCHAR* keyfile = AppFilePath( SSL_KEY );
		if( crtfile && keyfile ){
			HANDLE hFile = CreateFileW( crtfile ,GENERIC_READ ,FILE_SHARE_READ ,NULL,
										OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL
			);
			if( hFile ){
				FILETIME writeTime;
				BOOL	 success = GetFileTime( hFile ,NULL ,NULL ,&writeTime );
				CloseHandle( hFile );
				if( success ){
					if( CompareFileTime( &writeTime ,&lastWrite ) ){
						lastWrite = writeTime;
						SSL_CTX_UseCertificate( crtfile, keyfile );
					}
				}
				else LogW(L"GetFileTime(%s)エラー%u",crtfile,GetLastError());
			}
			else LogW(L"CreateFile(%s)エラー%u",crtfile,GetLastError());
		}
		if( crtfile ) free( crtfile );
		if( keyfile ) free( keyfile );
	}
}

// 設定ファイル保存
typedef struct {
	WCHAR	wListenPort[8];
	BOOL	bindLocal;
	BOOL	loginRemote;
	BOOL	loginLocal;
	BOOL	httpsRemote;
	BOOL	httpsLocal;
	BOOL	bootMinimal;
	UCHAR*	loginPass;
	WCHAR*	wExe[BI_COUNT];
	WCHAR*	wArg[BI_COUNT];
	BOOL	hide[BI_COUNT];
} ConfigData;

void ConfigSave( const ConfigData* dp )
{
	WCHAR new[MAX_PATH+1]=L"";
	WCHAR* p;
	GetModuleFileNameW( NULL ,new ,sizeof(new)/sizeof(WCHAR) );
	p = wcsrchr( new ,L'\\' );
	if( p ){
		// my.ini.new 作成
		FILE* fp;
		wcscpy( p+1 ,L"my.ini.new" );
		fp = _wfopen( new ,L"wb" );
		if( fp ){
			UCHAR*	listenPort = WideCharToUTF8alloc( dp->wListenPort );
			UCHAR*	exe[BI_COUNT];
			UCHAR*	arg[BI_COUNT];
			WCHAR	ini[MAX_PATH+1] = L"";
			UCHAR	b64txt[SHA256_DIGEST_LENGTH*2]="";
			UINT	i;
			for( i=0; i<BI_COUNT; i++ ){
				exe[i] = WideCharToUTF8alloc( dp->wExe[i] );
				arg[i] = WideCharToUTF8alloc( dp->wArg[i] );
			}
			if( dp->loginPass ){
				// 新パスワード:SHA256ハッシュ
				// http://www.askyb.com/cpp/openssl-sha256-hashing-example-in-cpp/
				// TODO:パスワード変更したらセッション(クッキー)削除すべき？でもGmail利用中に
				// 別ブラウザでパスワード変更してもセッションは有効だった。ので問題ないかな。
				UCHAR digest[SHA256_DIGEST_LENGTH]="";
				SHA256( dp->loginPass ,strlen(dp->loginPass) ,digest );
				if( base64encode( digest ,sizeof(digest) ,b64txt ,sizeof(b64txt) ) ){
					// BASE64検査
					UCHAR test[SHA256_DIGEST_LENGTH*2]="";
					if( base64decode( b64txt ,strlen(b64txt) ,test ) ){
						if( memcmp( test ,digest ,SHA256_DIGEST_LENGTH ) )
							LogW(L"ログインパスワード内部エラー(BASE64デコード検査エラー)");
					}
				}
			}
			else{
				// 登録済みパスワード
				if( LoginPass( b64txt ,sizeof(b64txt) ) && !*b64txt )
					LogW(L"設定ファイルのログインパスワード情報が不正です(破棄されます)");
			}
			fprintf(fp,"ListenPort=%s\r\n"	,listenPort			? listenPort:"");
			fprintf(fp,"BindLocal=%s\r\n"	,dp->bindLocal		? "1":"");
			fprintf(fp,"LoginPass=%s\r\n"	,b64txt);
			fprintf(fp,"LoginRemote=%s\r\n"	,dp->loginRemote	? "1":"");
			fprintf(fp,"LoginLocal=%s\r\n"	,dp->loginLocal		? "1":"");
			fprintf(fp,"HttpsRemote=%s\r\n"	,dp->httpsRemote	? "1":"");
			fprintf(fp,"HttpsLocal=%s\r\n"	,dp->httpsLocal		? "1":"");
			fprintf(fp,"BootMinimal=%s\r\n"	,dp->bootMinimal	? "1":"");
			fprintf(fp,"IEArg=%s\r\n"		,arg[BI_IE]				? arg[BI_IE]:"");
			fprintf(fp,"IEHide=%s\r\n"		,dp->hide[BI_IE]		? "1":"");
			fprintf(fp,"ChromeArg=%s\r\n"	,arg[BI_CHROME]			? arg[BI_CHROME]:"");
			fprintf(fp,"ChromeHide=%s\r\n"	,dp->hide[BI_CHROME]	? "1":"");
			fprintf(fp,"FirefoxArg=%s\r\n"	,arg[BI_FIREFOX]		? arg[BI_FIREFOX]:"");
			fprintf(fp,"FirefoxHide=%s\r\n"	,dp->hide[BI_FIREFOX]	? "1":"");
			fprintf(fp,"OperaArg=%s\r\n"	,arg[BI_OPERA]			? arg[BI_OPERA]:"");
			fprintf(fp,"OperaHide=%s\r\n"	,dp->hide[BI_OPERA]		? "1":"");
			for( i=BI_USER1; i<BI_COUNT; i++ ){
				fprintf(fp,"Exe%u=%s\r\n"	,i-BI_USER1+1 ,exe[i]		? exe[i]:"");
				fprintf(fp,"Arg%u=%s\r\n"	,i-BI_USER1+1 ,arg[i]		? arg[i]:"");
				fprintf(fp,"Hide%u=%s\r\n"	,i-BI_USER1+1 ,dp->hide[i]	? "1":"");
			}
			if( listenPort ) free( listenPort );
			for( i=0; i<BI_COUNT; i++ ){
				if( exe[i] ) free( exe[i] );
				if( arg[i] ) free( arg[i] );
			}
			fclose(fp);
			// my.ini.new -> my.ini
			wcscpy( ini, new );
			ini[wcslen(ini)-4] = L'\0';
			if( !MoveFileExW( new ,ini ,MOVEFILE_REPLACE_EXISTING |MOVEFILE_WRITE_THROUGH ))
				LogW(L"MoveFileEx(%s)エラー%u",new,GetLastError());
		}
		else LogW(L"fopen(%s)エラー",new);
	}
}
// リソースを使わないモーダルダイアログ
// http://www.sm.rim.or.jp/~shishido/mdialog.html
// ダイアログ用ID
#define ID_DLG_NULL				0
#define ID_DLG_OK				1
#define ID_DLG_CANCEL			2
#define ID_DLG_FOPEN			3
#define ID_DLG_CLOSE			4
#define ID_DLG_HTTPS_REMOTE		5
#define ID_DLG_HTTPS_LOCAL		6
#define ID_DLG_SSL_VIEWCRT		7
#define ID_DLG_SSL_MAKECRT		8
#define ID_DLG_LOGIN_REMOTE		9
#define ID_DLG_LOGIN_LOCAL		10
#define ID_DLG_DESTROY			99
typedef struct {
	HWND		hTabc;
	HWND		hOK;
	HWND		hCancel;
	HWND		hListenPort;
	HWND		hListenPortTxt;
	HWND		hBindAddrTxt;
	HWND		hBindAny;
	HWND		hBindLocal;
	HWND		hLoginPassTxt;
	HWND		hLoginPass;
	HWND		hLoginPassState;
	HWND		hLoginRemote;
	HWND		hLoginLocal;
	HWND		hLinkRemote;
	HWND		hLinkLocal;
	HWND		hHttpsTxt;
	HWND		hHttpsRemote;
	HWND		hHttpsLocal;
	HWND		hSSLCrt;
	HWND		hSSLKey;
	HWND		hSSLViewCrt;
	HWND		hSSLMakeCrt;
	HWND		hBootMinimal;
	HWND		hBtnWoTxt;
	HWND		hExeTxt;
	HWND		hArgTxt;
	HWND		hFOpen;
	HWND		hHide[BI_COUNT];
	HWND		hExe[BI_COUNT];
	HWND		hArg[BI_COUNT];
	HICON		hIcon[BI_COUNT];
	HFONT		hFontM;
	HFONT		hFontS;
	HIMAGELIST	hImage;
	DWORD		result;
} ConfigDialogData;

BOOL isChecked( HWND hwnd ){ return (SendMessage(hwnd,BM_GETCHECK,0,0)==BST_CHECKED)? TRUE:FALSE; }

// ログインパスワードとHTTPS(SSL)のチェックボックスで、クリックしたところと違うところに勝手にチェック
// が付く連動チェックになることを示す線を表示するためのウィンドウプロシージャ。マウスが乗ったら連結線
// ウィンドウを表示する。チェックの付け外し処理は親ウィンドウで、ここでは連結線ウィンドウ表示制御のみ。
WNDPROC DefButtonProc = NULL; // 既定ボタンコントロールウィンドウプロシージャ
LRESULT CALLBACK LinkCheckboxProc( HWND hwnd, UINT msg, WPARAM wp, LPARAM lp )
{
	ConfigDialogData* my;
	TRACKMOUSEEVENT tme;
	HWND hParent;

	switch( msg ){
	case WM_MOUSEMOVE:
		hParent = GetParent( hwnd );
		if( hParent ){
			my = (ConfigDialogData*)GetWindowLong( hParent ,GWL_USERDATA );
			if( my ){
				tme.cbSize = sizeof(tme);
				tme.dwFlags = TME_LEAVE;
				if( hwnd==my->hLoginRemote ){
					if( !isChecked(my->hLoginRemote) && !isChecked(my->hHttpsRemote) ){
						// パスワード有効時はHTTP(SSL)必要
						if( !IsWindowVisible( my->hLinkRemote ) ){
							ShowWindow( my->hLinkRemote ,SW_SHOW );
							tme.hwndTrack = my->hLoginRemote;
							TrackMouseEvent( &tme );
						}
					}
				}
				else if( hwnd==my->hHttpsRemote ){
					if( isChecked(my->hLoginRemote) && isChecked(my->hHttpsRemote) ){
						// HTTP(SSL)無効時はパスワードも無効
						if( !IsWindowVisible( my->hLinkRemote ) ){
							ShowWindow( my->hLinkRemote ,SW_SHOW );
							tme.hwndTrack = my->hHttpsRemote;
							TrackMouseEvent( &tme );
						}
					}
				}
				if( hwnd==my->hLoginLocal ){
					if( !isChecked(my->hLoginLocal) && !isChecked(my->hHttpsLocal) ){
						// パスワード有効時はHTTP(SSL)必要
						if( !IsWindowVisible( my->hLinkLocal ) ){
							ShowWindow( my->hLinkLocal ,SW_SHOW );
							tme.hwndTrack = my->hLoginLocal;
							TrackMouseEvent( &tme );
						}
					}
				}
				else if( hwnd==my->hHttpsLocal ){
					if( isChecked(my->hLoginLocal) && isChecked(my->hHttpsLocal) ){
						// HTTP(SSL)無効時はパスワードも無効
						if( !IsWindowVisible( my->hLinkLocal ) ){
							ShowWindow( my->hLinkLocal ,SW_SHOW );
							tme.hwndTrack = my->hHttpsLocal;
							TrackMouseEvent( &tme );
						}
					}
				}
			}
		}
		break;

	case WM_MOUSELEAVE:
		hParent = GetParent( hwnd );
		if( hParent ){
			my = (ConfigDialogData*)GetWindowLong( hParent ,GWL_USERDATA );
			if( my ){
				// 線隠す
				ShowWindow( my->hLinkRemote ,SW_HIDE );
				ShowWindow( my->hLinkLocal ,SW_HIDE );
			}
		}
		break;
	}
	return CallWindowProc( DefButtonProc ,hwnd ,msg ,wp ,lp );
}

LRESULT CALLBACK ConfigDialogProc( HWND hwnd, UINT msg, WPARAM wp, LPARAM lp )
{
	ConfigDialogData* my = (ConfigDialogData*)GetWindowLong( hwnd ,GWL_USERDATA );
	if( my ){
		switch( msg ){
		case WM_CREATE_AFTER:
			{
				HINSTANCE hinst = (HINSTANCE)wp;
				BrowserInfo* br;
				TCITEMW item;
				WCHAR* sslcrt = AppFilePath( SSL_CRT );
				WCHAR* sslkey = AppFilePath( SSL_KEY );
				UINT tabid;
				RECT rc;
				UINT i;
				// フォント
				my->hFontM = CreateFontA(17,0,0,0,0,0,0,0,0,0,0,0,0,"MS P Gothic");
				my->hFontS = CreateFontA(16,0,0,0,0,0,0,0,0,0,0,0,0,"MS P Gothic");
				// タブコントロール
				// タブの数と内容は環境(ブラウザインストール状態)により変わるため、タブのインデックス値で
				// タブの識別はできない。そこでlParamにタブ識別IDを格納しておき、WM_NOTIFYではこのIDを
				// 取り出してタブを特定する。
				my->hTabc = CreateWindowW(
							WC_TABCONTROLW, L""
							,WS_CHILD |WS_VISIBLE |TCS_RIGHTJUSTIFY |TCS_MULTILINE
							,0,0,0,0 ,hwnd,NULL ,hinst,NULL
				);
				SendMessage( my->hTabc, WM_SETFONT, (WPARAM)my->hFontM, 0 );
				my->hImage = ImageList_Create( 16, 16, ILC_COLOR32 |ILC_MASK, 1, 5 );
				// アイコンイメージリスト背景色を描画先背景色と同じにする。しないと表示がギザギザ汚い。
				ImageList_SetBkColor( my->hImage, GetSysColor(COLOR_BTNFACE) );
				// HTTPサーバタブ(ID=0)
				item.mask = TCIF_TEXT |TCIF_IMAGE |TCIF_PARAM;
				item.pszText = L"HTTPサーバ";
				item.iImage = ImageList_AddIcon( my->hImage, LoadIconA(hinst,"0") );
				item.lParam = (LPARAM)0;					// タブ識別ID
				TabCtrl_InsertItem( my->hTabc, 0, &item );		// タブインデックス
				my->hListenPortTxt = CreateWindowW(
							L"static",L"待受ポート番号" ,WS_CHILD |SS_SIMPLE
							,0,0,0,0 ,hwnd,NULL ,hinst,NULL
				);
				my->hListenPort = CreateWindowW(
							L"edit",ListenPort ,WS_CHILD |WS_BORDER |WS_TABSTOP |ES_LEFT
							,0,0,0,0 ,hwnd,NULL ,hinst,NULL
				);
				my->hBindAddrTxt = CreateWindowW(
							L"static",L"待受アドレス" ,WS_CHILD |SS_SIMPLE
							,0,0,0,0 ,hwnd,NULL ,hinst,NULL
				);
				my->hBindAny = CreateWindowW(
							L"button",L"どこからでも" ,WS_CHILD |WS_TABSTOP |BS_AUTORADIOBUTTON
							,0,0,0,0 ,hwnd,NULL ,hinst,NULL
				);
				my->hBindLocal = CreateWindowW(
							L"button",L"localhostのみ" ,WS_CHILD |WS_TABSTOP |BS_AUTORADIOBUTTON
							,0,0,0,0 ,hwnd,NULL ,hinst,NULL
				);
				my->hLoginPassTxt = CreateWindowW(
							L"static",L"ログインパスワード" ,WS_CHILD |SS_SIMPLE
							,0,0,0,0 ,hwnd,NULL ,hinst,NULL
				);
				my->hLoginPass = CreateWindowExW(
							WS_EX_CLIENTEDGE ,L"edit",L""
							,WS_CHILD |WS_BORDER |WS_TABSTOP |ES_LEFT |ES_PASSWORD |ES_AUTOHSCROLL
							,0,0,0,0 ,hwnd,NULL ,hinst,NULL
				);
				my->hLoginPassState = CreateWindowW(
							L"static",LoginPass(NULL,0)? L"(登録済み・変更する時は入力)" :L"(未登録)"
							,WS_CHILD |SS_SIMPLE ,0,0,0,0 ,hwnd,NULL ,hinst,NULL
				);
				my->hLinkRemote = CreateWindowW(
							L"static",L"" ,WS_CHILD |WS_BORDER ,0,0,0,0 ,hwnd,NULL ,hinst,NULL
				);
				my->hLinkLocal = CreateWindowW(
							L"static",L"" ,WS_CHILD |WS_BORDER ,0,0,0,0 ,hwnd,NULL ,hinst,NULL
				);
				my->hLoginRemote = CreateWindowW(
							L"button",L"localhost以外" ,WS_CHILD |WS_TABSTOP |BS_AUTOCHECKBOX
							,0,0,0,0 ,hwnd,(HMENU)ID_DLG_LOGIN_REMOTE ,hinst,NULL
				);
				my->hLoginLocal = CreateWindowW(
							L"button",L"localhost" ,WS_CHILD |WS_TABSTOP |BS_AUTOCHECKBOX
							,0,0,0,0 ,hwnd,(HMENU)ID_DLG_LOGIN_LOCAL ,hinst,NULL
				);
				my->hHttpsTxt = CreateWindowW(
							L"static",L"HTTPS(SSL)" ,WS_CHILD |SS_SIMPLE
							,0,0,0,0 ,hwnd,NULL ,hinst,NULL
				);
				my->hHttpsRemote = CreateWindowW(
							L"button",L"localhost以外" ,WS_CHILD |WS_TABSTOP |BS_AUTOCHECKBOX
							,0,0,0,0 ,hwnd,(HMENU)ID_DLG_HTTPS_REMOTE ,hinst,NULL
				);
				my->hHttpsLocal = CreateWindowW(
							L"button",L"localhost" ,WS_CHILD |WS_TABSTOP |BS_AUTOCHECKBOX
							,0,0,0,0 ,hwnd,(HMENU)ID_DLG_HTTPS_LOCAL ,hinst,NULL
				);
				if( sslcrt ){
					my->hSSLCrt = CreateWindowW(
								L"static"
								,PathFileExistsW(sslcrt)? L"サーバ証明書：" SSL_CRT :L"サーバ証明書：なし"
								,WS_CHILD |SS_SIMPLE
								,0,0,0,0 ,hwnd,NULL ,hinst,NULL
					);
					free( sslcrt );
				}
				if( sslkey ){
					my->hSSLKey = CreateWindowW(
								L"static"
								,PathFileExistsW(sslkey)? L"秘密鍵：" SSL_KEY :L"秘密鍵：なし"
								,WS_CHILD |SS_SIMPLE
								,0,0,0,0 ,hwnd,NULL ,hinst,NULL
					);
					free( sslkey );
				}
				my->hSSLViewCrt = CreateWindowW(
							L"button",L"証明書を見る" ,WS_CHILD |WS_TABSTOP
							,0,0,0,0 ,hwnd,(HMENU)ID_DLG_SSL_VIEWCRT ,hinst,NULL
				);
				my->hSSLMakeCrt = CreateWindowW(
							L"button",L"証明書（自己署名）を（再）作成" ,WS_CHILD |WS_TABSTOP
							,0,0,0,0 ,hwnd,(HMENU)ID_DLG_SSL_MAKECRT ,hinst,NULL
				);
				my->hBootMinimal = CreateWindowW(
							L"button",L"起動時から最小化（タスクトレイ収納）"
							,WS_CHILD |WS_TABSTOP |BS_AUTOCHECKBOX ,0,0,0,0 ,hwnd,NULL ,hinst,NULL
				);
				DefButtonProc = (WNDPROC)GetWindowLong( my->hHttpsLocal ,GWLP_WNDPROC );
				SetWindowLong( my->hLoginRemote ,GWLP_WNDPROC ,(LONG)LinkCheckboxProc );
				SetWindowLong( my->hLoginLocal ,GWLP_WNDPROC ,(LONG)LinkCheckboxProc );
				SetWindowLong( my->hHttpsRemote ,GWLP_WNDPROC ,(LONG)LinkCheckboxProc );
				SetWindowLong( my->hHttpsLocal ,GWLP_WNDPROC ,(LONG)LinkCheckboxProc );
				SendMessage( BindLocal? my->hBindLocal :my->hBindAny ,BM_SETCHECK ,BST_CHECKED ,0 );
				SendMessage( my->hLoginPass ,EM_SETLIMITTEXT ,(WPARAM)LOGINPASS_MAX+1 ,0 ); // エラー通知用＋1文字
				if( LoginRemote ) SendMessage( my->hLoginRemote ,BM_SETCHECK ,BST_CHECKED ,0 );
				if( LoginLocal ) SendMessage( my->hLoginLocal ,BM_SETCHECK ,BST_CHECKED ,0 );
				if( HttpsRemote ) SendMessage( my->hHttpsRemote ,BM_SETCHECK ,BST_CHECKED ,0 );
				if( HttpsLocal ) SendMessage( my->hHttpsLocal ,BM_SETCHECK ,BST_CHECKED ,0 );
				if( !LoginRemote && !LoginLocal ){
					EnableWindow( my->hLoginPass ,FALSE );
				}
				if( !HttpsRemote && !HttpsLocal ){
					EnableWindow( my->hSSLViewCrt ,FALSE );
					EnableWindow( my->hSSLMakeCrt ,FALSE );
				}
				if( BootMinimal ) SendMessage( my->hBootMinimal ,BM_SETCHECK ,BST_CHECKED ,0 );
				SendMessage( my->hListenPortTxt		,WM_SETFONT ,(WPARAM)my->hFontM ,0 );
				SendMessage( my->hListenPort		,WM_SETFONT ,(WPARAM)my->hFontM ,0 );
				SendMessage( my->hBindAddrTxt		,WM_SETFONT ,(WPARAM)my->hFontM ,0 );
				SendMessage( my->hBindAny			,WM_SETFONT ,(WPARAM)my->hFontM ,0 );
				SendMessage( my->hBindLocal			,WM_SETFONT ,(WPARAM)my->hFontM ,0 );
				SendMessage( my->hLoginPassTxt		,WM_SETFONT ,(WPARAM)my->hFontM ,0 );
				SendMessage( my->hLoginPass			,WM_SETFONT ,(WPARAM)my->hFontM ,0 );
				SendMessage( my->hLoginPassState	,WM_SETFONT ,(WPARAM)my->hFontM ,0 );
				SendMessage( my->hLoginLocal		,WM_SETFONT ,(WPARAM)my->hFontM ,0 );
				SendMessage( my->hLoginRemote		,WM_SETFONT ,(WPARAM)my->hFontM ,0 );
				SendMessage( my->hHttpsTxt			,WM_SETFONT ,(WPARAM)my->hFontM ,0 );
				SendMessage( my->hHttpsLocal		,WM_SETFONT ,(WPARAM)my->hFontM ,0 );
				SendMessage( my->hHttpsRemote		,WM_SETFONT ,(WPARAM)my->hFontM ,0 );
				SendMessage( my->hSSLCrt			,WM_SETFONT ,(WPARAM)my->hFontS ,0 );
				SendMessage( my->hSSLKey			,WM_SETFONT ,(WPARAM)my->hFontS ,0 );
				SendMessage( my->hSSLViewCrt		,WM_SETFONT ,(WPARAM)my->hFontS ,0 );
				SendMessage( my->hSSLMakeCrt		,WM_SETFONT ,(WPARAM)my->hFontS ,0 );
				SendMessage( my->hBootMinimal		,WM_SETFONT ,(WPARAM)my->hFontM ,0 );
				// ブラウザタブ(ID=1～8、Browserインデックス＋1)
				br = BrowserInfoAlloc();
				if( br ){
					for( tabid=1,i=0; i<BI_COUNT; i++, tabid++ ){
						if( br[i].exe || (BI_USER1<=i && i<=BI_USER4) ){
							my->hIcon[i] = FileIconLoad( br[i].exe );
							item.pszText = br[i].name;
							item.iImage = my->hIcon[i]? ImageList_AddIcon( my->hImage, my->hIcon[i] ) : -1;
							item.lParam = (LPARAM)tabid;				// タブ識別ID
							TabCtrl_InsertItem( my->hTabc, tabid, &item );	// タブインデックス
						}
					}
					my->hBtnWoTxt = CreateWindowW(
								L"static",L"ボタンを" ,WS_CHILD |SS_SIMPLE ,0,0,0,0 ,hwnd,NULL ,hinst,NULL
					);
					my->hExeTxt = CreateWindowW(
								L"static",L"実行ﾌｧｲﾙ" ,WS_CHILD |SS_SIMPLE ,0,0,0,0 ,hwnd,NULL ,hinst,NULL
					);
					my->hArgTxt = CreateWindowW(
								L"static",L"引 数" ,WS_CHILD |SS_SIMPLE ,0,0,0,0 ,hwnd,NULL ,hinst,NULL
					);
					my->hFOpen = CreateWindowW(
								L"button",L"" /* L"参照"*/ ,WS_CHILD |WS_TABSTOP |BS_ICON
								,0,0,0,0 ,hwnd,(HMENU)ID_DLG_FOPEN ,hinst,NULL
					);
					SendMessage( my->hBtnWoTxt, WM_SETFONT, (WPARAM)my->hFontM, 0 );
					SendMessage( my->hExeTxt, WM_SETFONT, (WPARAM)my->hFontM, 0 );
					SendMessage( my->hArgTxt, WM_SETFONT, (WPARAM)my->hFontM, 0 );
					for( i=0; i<BI_COUNT; i++ ){
						my->hHide[i] = CreateWindowW(
									L"button",L"表示しない" ,WS_CHILD |WS_TABSTOP |BS_AUTOCHECKBOX
									,0,0,0,0 ,hwnd,NULL ,hinst,NULL
						);
						my->hExe[i] = CreateWindowW(
									L"edit",br[i].exe
									,WS_CHILD |WS_BORDER |WS_TABSTOP |ES_LEFT |ES_AUTOHSCROLL
									,0,0,0,0 ,hwnd,NULL ,hinst,NULL
						);
						my->hArg[i] = CreateWindowW(
									L"edit",br[i].arg
									,WS_CHILD |WS_BORDER |WS_TABSTOP |ES_LEFT |ES_AUTOHSCROLL
									,0,0,0,0 ,hwnd,NULL ,hinst,NULL
						);
						SendMessage( my->hHide[i], WM_SETFONT, (WPARAM)my->hFontM, 0 );
						SendMessage( my->hExe[i], WM_SETFONT, (WPARAM)my->hFontM, 0 );
						SendMessage( my->hArg[i], WM_SETFONT, (WPARAM)my->hFontM, 0 );
						if( br[i].hide ) SendMessage( my->hHide[i], BM_SETCHECK, BST_CHECKED, 0 );
					}
					// 既定ブラウザEXEパスは編集不可
					SendMessage( my->hExe[BI_IE], EM_SETREADONLY, TRUE, 0 );
					SendMessage( my->hExe[BI_CHROME], EM_SETREADONLY, TRUE, 0 );
					SendMessage( my->hExe[BI_FIREFOX], EM_SETREADONLY, TRUE, 0 );
					SendMessage( my->hExe[BI_OPERA], EM_SETREADONLY, TRUE, 0 );
					// 参照ボタンアイコン
					SendMessage(
							my->hFOpen ,BM_SETIMAGE ,IMAGE_ICON
							,(LPARAM)LoadImageA(hinst,"OPEN",IMAGE_ICON,16,16,0)
					);
					BrowserInfoFree(br), br=NULL;
				}
				SendMessage( my->hTabc, TCM_SETIMAGELIST, (WPARAM)0, (LPARAM)my->hImage );
				// OK・キャンセルボタン
				my->hOK = CreateWindowW(
							L"button",L" O K " ,WS_CHILD |WS_VISIBLE |WS_TABSTOP
							,0,0,0,0 ,hwnd,(HMENU)ID_DLG_OK ,hinst,NULL
				);
				my->hCancel = CreateWindowW(
							L"button",L"ｷｬﾝｾﾙ" ,WS_CHILD |WS_VISIBLE |WS_TABSTOP
							,0,0,0,0 ,hwnd,(HMENU)ID_DLG_CANCEL ,hinst,NULL
				);
				SendMessage( my->hOK, WM_SETFONT, (WPARAM)my->hFontM, 0 );
				SendMessage( my->hCancel, WM_SETFONT, (WPARAM)my->hFontM, 0 );
				DragAcceptFiles( hwnd, TRUE ); // ドラッグ＆ドロップ可
				// 配置のためWM_SIZE強制発行
				GetClientRect( hwnd ,&rc );
				SendMessage( hwnd ,WM_SIZE ,(WPARAM)0 ,MAKELPARAM(rc.right,rc.bottom) );
			}
			return 0;

		case WM_SIZE:
			{
				RECT rc = { 0,0, LOWORD(lp), HIWORD(lp) };	// same as GetClientRect( hwnd, &rc );
				UINT i;
				MoveWindow( my->hTabc, 0,0, LOWORD(lp), HIWORD(lp), TRUE );
				// タブを除いた表示領域を取得(rc.topがタブの高さになる)
				TabCtrl_AdjustRect( my->hTabc, FALSE, &rc );
				// パーツ移動
				MoveWindow( my->hListenPortTxt	,35  ,rc.top+20+2  ,110 ,22 ,TRUE );
				MoveWindow( my->hListenPort		,135 ,rc.top+20    ,80  ,22 ,TRUE );
				MoveWindow( my->hBindAddrTxt	,50  ,rc.top+55+2  ,110 ,22 ,TRUE );
				MoveWindow( my->hBindAny		,135 ,rc.top+55    ,90  ,22 ,TRUE );
				MoveWindow( my->hBindLocal		,235 ,rc.top+55    ,110 ,22 ,TRUE );
				MoveWindow( my->hLoginPassTxt	,25  ,rc.top+90+2  ,110 ,22 ,TRUE );
				MoveWindow( my->hLoginPass		,135 ,rc.top+90    ,180 ,22 ,TRUE );
				MoveWindow( my->hLoginPassState	,320 ,rc.top+90+2  ,180 ,22 ,TRUE );
				MoveWindow( my->hLoginRemote	,135 ,rc.top+115   ,110 ,21 ,TRUE );
				MoveWindow( my->hLinkRemote		,138 ,rc.top+115   ,6   ,50 ,TRUE );
				MoveWindow( my->hLoginLocal		,255 ,rc.top+115   ,85  ,21 ,TRUE );
				MoveWindow( my->hLinkLocal		,258 ,rc.top+115   ,6   ,50 ,TRUE );
				MoveWindow( my->hHttpsTxt		,36  ,rc.top+150+2 ,110 ,22 ,TRUE );
				MoveWindow( my->hHttpsRemote	,135 ,rc.top+150   ,110 ,21 ,TRUE );
				MoveWindow( my->hHttpsLocal		,255 ,rc.top+150   ,85  ,21 ,TRUE );
				MoveWindow( my->hSSLCrt			,135 ,rc.top+180   ,130 ,26 ,TRUE );
				MoveWindow( my->hSSLKey			,275 ,rc.top+180   ,130 ,26 ,TRUE );
				MoveWindow( my->hSSLViewCrt		,135 ,rc.top+200   ,100 ,26 ,TRUE );
				MoveWindow( my->hSSLMakeCrt		,235 ,rc.top+200   ,220 ,26 ,TRUE );
				MoveWindow( my->hBootMinimal	,35  ,rc.top+245   ,240 ,22 ,TRUE );
				MoveWindow( my->hBtnWoTxt		,40  ,rc.top+26    ,70  ,22 ,TRUE );
				MoveWindow( my->hExeTxt			,20  ,rc.top+60+2  ,90  ,22 ,TRUE );
				MoveWindow( my->hArgTxt			,50  ,rc.top+100+2 ,60  ,22 ,TRUE );
				for( i=0; i<BI_USER1; i++ ){
					MoveWindow( my->hHide[i]	,100 ,rc.top+24  ,90 ,22 ,TRUE );
					MoveWindow( my->hExe[i]		,100 ,rc.top+60  ,LOWORD(lp)-120 ,22 ,TRUE );
					MoveWindow( my->hArg[i]		,100 ,rc.top+100 ,LOWORD(lp)-120 ,22 ,TRUE );
				}
				for( i=BI_USER1; i<BI_COUNT; i++ ){
					MoveWindow( my->hHide[i]	,100 ,rc.top+24  ,120 ,22 ,TRUE );
					MoveWindow( my->hExe[i]		,100 ,rc.top+60  ,LOWORD(lp)-120-24 ,22 ,TRUE );
					MoveWindow( my->hArg[i]		,100 ,rc.top+100 ,LOWORD(lp)-120    ,22 ,TRUE );
				}
				MoveWindow( my->hFOpen	,LOWORD(lp)-44  ,rc.top+60-1   ,24 ,24 ,TRUE );
				MoveWindow( my->hOK		,LOWORD(lp)-200 ,HIWORD(lp)-50 ,80 ,30 ,TRUE );
				MoveWindow( my->hCancel	,LOWORD(lp)-100 ,HIWORD(lp)-50 ,80 ,30 ,TRUE );
			}
			return 0;

		case WM_CTLCOLORSTATIC: // スタティックコントール描画色
			if( (HWND)lp==my->hLoginPassState ){
				if( !isChecked(my->hLoginRemote) && !isChecked(my->hLoginLocal) ){
					// パスワード無効の時、状態テキスト色薄く
					LRESULT r = DefDlgProc( hwnd, msg, wp, lp );
					SetTextColor( (HDC)wp ,RGB(160,160,160) );
					return r;
				}
			}
			else if( (HWND)lp==my->hSSLCrt || (HWND)lp==my->hSSLKey ){
				if( !isChecked(my->hHttpsRemote) && !isChecked(my->hHttpsLocal) ){
					// SSL無効の時、証明書テキスト色薄く
					LRESULT r = DefDlgProc( hwnd, msg, wp, lp );
					SetTextColor( (HDC)wp ,RGB(160,160,160) );
					return r;
				}
			}
			break;

		case WM_NOTIFY:
			if( ((NMHDR*)lp)->code==TCN_SELCHANGE ){
				// 選択タブ識別ID(lParam)取得(※タブインデックスではない)
				TCITEM item;
				item.mask = TCIF_PARAM;
				TabCtrl_GetItem( my->hTabc, TabCtrl_GetCurSel(my->hTabc), &item );
				SendMessage( hwnd, WM_TABSELECT, item.lParam, 0 );
			}
			return 0;

		case WM_TABSELECT:
			{
				// wParamにタブIDが入っている（※タブインデックスではない）
				int tabid = (int)wp;
				int tabindex = TabCtrl_GetSelHasLParam( my->hTabc ,tabid );
				UINT i;
				TabCtrl_SetCurSel( my->hTabc ,tabindex );
				TabCtrl_SetCurFocus( my->hTabc ,tabindex );
				// いったん全部隠して
				ShowWindow( my->hListenPortTxt	,SW_HIDE );
				ShowWindow( my->hListenPort		,SW_HIDE );
				ShowWindow( my->hBindAddrTxt	,SW_HIDE );
				ShowWindow( my->hBindAny		,SW_HIDE );
				ShowWindow( my->hBindLocal		,SW_HIDE );
				ShowWindow( my->hLoginPassTxt	,SW_HIDE );
				ShowWindow( my->hLoginPass		,SW_HIDE );
				ShowWindow( my->hLoginPassState	,SW_HIDE );
				ShowWindow( my->hLoginLocal		,SW_HIDE );
				ShowWindow( my->hLoginRemote	,SW_HIDE );
				ShowWindow( my->hLinkRemote		,SW_HIDE );
				ShowWindow( my->hLinkLocal		,SW_HIDE );
				ShowWindow( my->hHttpsTxt		,SW_HIDE );
				ShowWindow( my->hHttpsLocal		,SW_HIDE );
				ShowWindow( my->hHttpsRemote	,SW_HIDE );
				ShowWindow( my->hSSLCrt			,SW_HIDE );
				ShowWindow( my->hSSLKey			,SW_HIDE );
				ShowWindow( my->hSSLViewCrt		,SW_HIDE );
				ShowWindow( my->hSSLMakeCrt		,SW_HIDE );
				ShowWindow( my->hBootMinimal	,SW_HIDE );
				ShowWindow( my->hBtnWoTxt		,SW_HIDE );
				ShowWindow( my->hExeTxt			,SW_HIDE );
				ShowWindow( my->hArgTxt			,SW_HIDE );
				ShowWindow( my->hFOpen			,SW_HIDE );
				for( i=0; i<BI_COUNT; i++ ){
					ShowWindow( my->hHide[i]	,SW_HIDE );
					ShowWindow( my->hExe[i]		,SW_HIDE );
					ShowWindow( my->hArg[i]		,SW_HIDE );
				}
				// 該当タブのものだけ表示
				switch( tabid ){
				case 0: // HTTPサーバ
					ShowWindow( my->hListenPortTxt	,SW_SHOW );
					ShowWindow( my->hListenPort		,SW_SHOW );
					ShowWindow( my->hBindAddrTxt	,SW_SHOW );
					ShowWindow( my->hBindAny		,SW_SHOW );
					ShowWindow( my->hBindLocal		,SW_SHOW );
					ShowWindow( my->hLoginPassTxt	,SW_SHOW );
					ShowWindow( my->hLoginPass		,SW_SHOW );
					ShowWindow( my->hLoginPassState	,SW_SHOW );
					ShowWindow( my->hLoginLocal		,SW_SHOW );
					ShowWindow( my->hLoginRemote	,SW_SHOW );
					ShowWindow( my->hHttpsTxt		,SW_SHOW );
					ShowWindow( my->hHttpsLocal		,SW_SHOW );
					ShowWindow( my->hHttpsRemote	,SW_SHOW );
					ShowWindow( my->hSSLCrt			,SW_SHOW );
					ShowWindow( my->hSSLKey			,SW_SHOW );
					ShowWindow( my->hSSLViewCrt		,SW_SHOW );
					ShowWindow( my->hSSLMakeCrt		,SW_SHOW );
					ShowWindow( my->hBootMinimal	,SW_SHOW );
					SetFocus( my->hListenPort );
					break;
				case 5: case 6: case 7: case 8: // ユーザ指定ブラウザ
					ShowWindow( my->hFOpen, SW_SHOW );
				case 1: case 2: case 3: case 4: // 既定ブラウザ
					ShowWindow( my->hBtnWoTxt, SW_SHOW );
					ShowWindow( my->hExeTxt, SW_SHOW );
					ShowWindow( my->hArgTxt, SW_SHOW );
					// タブID-1がBrowserインデックスと対応している(TODO:わかりにくい)
					ShowWindow( my->hHide[tabid-1], SW_SHOW );
					ShowWindow( my->hExe[tabid-1], SW_SHOW );
					ShowWindow( my->hArg[tabid-1], SW_SHOW );
					SetFocus( (tabid<=4)? my->hArg[tabid-1] :my->hExe[tabid-1] );
					break;
				}
			}
			return 0;

		case WM_COMMAND:
			switch( LOWORD(wp) ){
			case ID_DLG_OK: // 設定ファイル保存
				{
					ConfigData	data;
					WCHAR		wPass[LOGINPASS_MAX+2]=L""; // エラー通知用＋1文字＋NULL文字
					int			iPort;
					UINT		i;

					memset( &data ,0 ,sizeof(data) );
					GetWindowTextW( my->hListenPort ,data.wListenPort ,sizeof(data.wListenPort)/sizeof(WCHAR) );
					iPort = _wtoi(data.wListenPort);
					if( iPort<=0 || iPort >65535 ){
						ErrorBoxW(L"ポート番号が不正です。");
						return 0;
					}
					data.bindLocal		= isChecked( my->hBindLocal );
					data.loginLocal		= isChecked( my->hLoginLocal );
					data.loginRemote	= isChecked( my->hLoginRemote );
					data.httpsLocal		= isChecked( my->hHttpsLocal );
					data.httpsRemote	= isChecked( my->hHttpsRemote );
					data.bootMinimal	= isChecked( my->hBootMinimal );
					GetWindowTextW( my->hLoginPass ,wPass ,sizeof(wPass)/sizeof(WCHAR) );
					if( *wPass ){
						UCHAR* pass = WideCharToUTF8alloc( wPass );
						if( pass ){
							if( strlen(pass) >LOGINPASS_MAX ){
								ErrorBoxW(L"パスワードは最大%uバイトです。",LOGINPASS_MAX);
								SetFocus( my->hLoginPass );
								free( pass );
								return 0;
							}
							data.loginPass = pass;
						}
						else ErrorBoxW(L"致命的エラー：ログインパスワードを登録できません");
					}
					else if( data.loginLocal || data.loginRemote ){
						if( !LoginPass(NULL,0) && IDYES !=MessageBoxW( hwnd
								,L"ログインパスワードが登録されていません。"
								L"空のパスワードではログインできません。このままでよろしいですか？"
								,L"確認" ,MB_YESNO |MB_ICONQUESTION
							)
						){ SetFocus( my->hLoginPass ); return 0; }
					}
					for( i=0; i<BI_COUNT; i++ ){
						data.wExe[i] = WindowTextAllocW( my->hExe[i] );
						data.wArg[i] = WindowTextAllocW( my->hArg[i] );
						data.hide[i] = isChecked( my->hHide[i] );
					}
					ConfigSave( &data );
					if( data.loginPass ) free( data.loginPass );
					for( i=0; i<BI_COUNT; i++ ){
						if( data.wExe[i] ) free( data.wExe[i] );
						if( data.wArg[i] ) free( data.wArg[i] );
					}
					if( data.httpsLocal || data.httpsRemote ){
						WCHAR* sslcrt = AppFilePath( SSL_CRT );
						WCHAR* sslkey = AppFilePath( SSL_KEY );
						if( sslcrt && sslkey && !PathFileExistsW(sslcrt) && !PathFileExistsW(sslkey) &&
							IDYES==MessageBoxW( hwnd
									,L"HTTP(SSL)が有効ですがサーバ証明書がありません。"
									L"証明書（自己署名）をいま作成しますか？"
									,L"確認" ,MB_YESNO |MB_ICONQUESTION
							)
						){
							HCURSOR cursor = SetCursor( LoadCursor(NULL,IDC_WAIT) );
							BOOL success = SSL_SelfCertCreate( sslcrt ,sslkey );
							SetCursor( cursor );
							SetWindowTextW( my->hSSLCrt
								,PathFileExistsW(sslcrt)? L"サーバ証明書：" SSL_CRT :L"サーバ証明書：なし"
							);
							SetWindowTextW( my->hSSLKey
								,PathFileExistsW(sslkey)? L"秘密鍵：" SSL_KEY :L"秘密鍵：なし"
							);
							if( success ) MessageBoxW( hwnd ,L"作成しました" ,L"情報" ,MB_ICONINFORMATION );
							else MessageBoxW( hwnd ,L"エラーが発生しました" ,L"エラー" ,MB_ICONERROR );
						}
						if( sslcrt ) free( sslcrt );
						if( sslkey ) free( sslkey );
					}
					my->result = ID_DLG_OK;
					DestroyWindow( hwnd );
				}
				break;

			case ID_DLG_CANCEL:
				my->result = ID_DLG_CANCEL;
				DestroyWindow( hwnd );
				break;

			case ID_DLG_FOPEN: // ユーザ指定ブラウザ実行ファイルをファイル選択ダイアログで入力
				{
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
						TabCtrl_GetItem( my->hTabc, TabCtrl_GetCurSel(my->hTabc), &item );
						// タブID-1がBrowserインデックスと対応している(TODO:わかりにくい)
						SetWindowTextW( my->hExe[item.lParam-1], wpath );
					}
				}
				break;

			case ID_DLG_LOGIN_REMOTE: // パスワードチェックボックス変化
				if( isChecked( my->hLoginRemote ) ){
					// パス入力有効
					EnableWindow( my->hLoginPass ,TRUE );
					// SSLも有効
					SendMessage(my->hHttpsRemote,BM_SETCHECK,BST_CHECKED,0 );
					SendMessage(hwnd,WM_COMMAND,(WPARAM)ID_DLG_HTTPS_REMOTE,0);
					ShowWindow( my->hLinkRemote ,SW_HIDE );
				}
				else if( !isChecked( my->hLoginLocal ) ){
					// パス入力無効
					EnableWindow( my->hLoginPass ,FALSE );
				}
				// パスワード状態テキスト色
				InvalidateRect( my->hLoginPassState ,NULL ,FALSE );
				break;

			case ID_DLG_LOGIN_LOCAL:
				if( isChecked( my->hLoginLocal ) ){
					// パス入力有効
					EnableWindow( my->hLoginPass ,TRUE );
					// SSLも有効
					SendMessage(my->hHttpsLocal,BM_SETCHECK,BST_CHECKED,0 );
					SendMessage(hwnd,WM_COMMAND,(WPARAM)ID_DLG_HTTPS_LOCAL,0);
					ShowWindow( my->hLinkLocal ,SW_HIDE );
				}
				else if( !isChecked( my->hLoginRemote ) ){
					// パス入力無効
					EnableWindow( my->hLoginPass ,FALSE );
				}
				// パスワード状態テキスト色
				InvalidateRect( my->hLoginPassState ,NULL ,FALSE );
				break;

			case ID_DLG_HTTPS_REMOTE: // HTTPSチェックボックス変化
				if( isChecked(my->hHttpsRemote) ){
					EnableWindow( my->hSSLViewCrt ,TRUE );
					EnableWindow( my->hSSLMakeCrt ,TRUE );
				}
				else{
					if( !isChecked(my->hHttpsLocal) ){
						EnableWindow( my->hSSLViewCrt ,FALSE );
						EnableWindow( my->hSSLMakeCrt ,FALSE );
					}
					// パスワード無効
					SendMessage(my->hLoginRemote,BM_SETCHECK,BST_UNCHECKED,0 );
					SendMessage(hwnd,WM_COMMAND,(WPARAM)ID_DLG_LOGIN_REMOTE,0);
					ShowWindow( my->hLinkRemote ,SW_HIDE );
				}
				// 証明書・秘密鍵テキスト色
				InvalidateRect( my->hSSLCrt ,NULL ,FALSE );
				InvalidateRect( my->hSSLKey ,NULL ,FALSE );
				break;

			case ID_DLG_HTTPS_LOCAL:
				if( isChecked(my->hHttpsLocal) ){
					EnableWindow( my->hSSLViewCrt ,TRUE );
					EnableWindow( my->hSSLMakeCrt ,TRUE );
				}
				else{
					if( !isChecked(my->hHttpsRemote) ){
						EnableWindow( my->hSSLViewCrt ,FALSE );
						EnableWindow( my->hSSLMakeCrt ,FALSE );
					}
					// パスワード無効
					SendMessage(my->hLoginLocal,BM_SETCHECK,BST_UNCHECKED,0 );
					SendMessage(hwnd,WM_COMMAND,(WPARAM)ID_DLG_LOGIN_LOCAL,0);
					ShowWindow( my->hLinkLocal ,SW_HIDE );
				}
				// 証明書・秘密鍵テキスト色
				InvalidateRect( my->hSSLCrt ,NULL ,FALSE );
				InvalidateRect( my->hSSLKey ,NULL ,FALSE );
				break;

			case ID_DLG_SSL_VIEWCRT:
				{
					WCHAR* sslcrt = AppFilePath( SSL_CRT );
					if( sslcrt ){
						if( PathFileExistsW(sslcrt) )
							ShellExecuteW( NULL,NULL ,sslcrt ,NULL,NULL ,SW_SHOWNORMAL );
						free( sslcrt );
					}
				}
				break;

			case ID_DLG_SSL_MAKECRT:
				{
					WCHAR* sslcrt = AppFilePath( SSL_CRT );
					WCHAR* sslkey = AppFilePath( SSL_KEY );
					if( sslcrt && sslkey ){
						int r = IDYES;
						if( PathFileExistsW(sslcrt) || PathFileExistsW(sslkey) ){
							r = MessageBoxW( hwnd
								,L"現在の証明書（" SSL_CRT L"）と秘密鍵（" SSL_KEY L"）を消去・上書きします。実行しますか？"
								,L"確認" ,MB_YESNO |MB_ICONQUESTION
							);
						}
						if( r==IDYES ){
							HCURSOR cursor;
							BOOL	success;
							DeleteFileW( sslcrt );
							DeleteFileW( sslkey );
							// TODO:2秒くらいかかりプログレスバーが親切だが面倒なので砂時計カーソル。
							cursor = SetCursor( LoadCursor(NULL,IDC_WAIT) );
							success = SSL_SelfCertCreate( sslcrt ,sslkey );
							SetCursor( cursor );
							SetWindowTextW( my->hSSLCrt
								,PathFileExistsW(sslcrt)? L"サーバ証明書：" SSL_CRT :L"サーバ証明書：なし"
							);
							SetWindowTextW( my->hSSLKey
								,PathFileExistsW(sslkey)? L"秘密鍵：" SSL_KEY :L"秘密鍵：なし"
							);
							if( success ) MessageBoxW( hwnd ,L"作成しました" ,L"情報" ,MB_ICONINFORMATION );
							else MessageBoxW( hwnd ,L"エラーが発生しました" ,L"エラー" ,MB_ICONERROR );
						}
					}
					if( sslcrt ) free( sslcrt );
					if( sslkey ) free( sslkey );
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
				if( poWnd==my->hExe[BI_USER1] ) SetWindowTextW( my->hExe[BI_USER1], dropfile0 );
				else if( poWnd==my->hExe[BI_USER2] ) SetWindowTextW( my->hExe[BI_USER2], dropfile0 );
				else if( poWnd==my->hExe[BI_USER3] ) SetWindowTextW( my->hExe[BI_USER3], dropfile0 );
				else if( poWnd==my->hExe[BI_USER4] ) SetWindowTextW( my->hExe[BI_USER4], dropfile0 );
			}
			return 0;

		case WM_DESTROY:
			{ UINT i; for(i=0;i<BI_COUNT;i++) DestroyIcon( my->hIcon[i] ); }
			ImageList_Destroy( my->hImage );
			DeleteObject( my->hFontM );
			DeleteObject( my->hFontS );
			SetWindowLong( hwnd ,GWL_USERDATA ,0 );
			if( my->result==ID_DLG_NULL ) my->result=ID_DLG_DESTROY;
			break;
		}
	}
	return DefDlgProc( hwnd, msg, wp, lp );
}
// 設定画面作成。引数は初期表示タブID(※タブインデックスではない)。
DWORD ConfigDialog( UINT tabid )
{
	#define				CONFIGDLGCLASS L"JCBookmarkConfigDialog"
	HINSTANCE			hinst = GetModuleHandle(NULL);
	WNDCLASSEXW			wc;
	ConfigDialogData	data;

	memset( &data, 0, sizeof(data) );
	data.result = ID_DLG_NULL;

	memset( &wc, 0, sizeof(wc) );
	wc.cbSize        = sizeof(wc);
	wc.cbWndExtra	 = DLGWINDOWEXTRA;
	wc.lpfnWndProc   = ConfigDialogProc;
	wc.hInstance     = hinst;
	wc.hIcon	     = LoadIconA( hinst ,"0" );
	wc.hCursor	     = LoadCursor(NULL,IDC_ARROW);
	wc.hbrBackground = (HBRUSH)(COLOR_BTNFACE+1);
	wc.lpszClassName = CONFIGDLGCLASS;

	if( RegisterClassExW(&wc) ){
		HWND hwnd = CreateWindowW(
						CONFIGDLGCLASS
						,APPNAME L" 設定"
						,WS_OVERLAPPED |WS_CAPTION |WS_THICKFRAME |WS_VISIBLE
						,GetSystemMetrics(SM_CXFULLSCREEN)/2 - 530/2
						,GetSystemMetrics(SM_CYFULLSCREEN)/2 - 390/2
						,530, 390
						,MainForm,NULL
						,GetModuleHandle(NULL),NULL
		);
		if( hwnd ){
			MSG msg;
			// メインフォーム無効
			EnableWindow( MainForm, FALSE );
			// 初期表示タブ
			PostMessage( hwnd, WM_TABSELECT, tabid, 0 );
			// ユーザデータ
			SetWindowLong( hwnd ,GWL_USERDATA ,(LONG)&data );
			SendMessage( hwnd ,WM_CREATE_AFTER ,(WPARAM)hinst ,0 );
			// ダイアログが結果を返すまでループ
			while( data.result==ID_DLG_NULL && GetMessage(&msg,NULL,0,0)>0 ){
				if( !IsDialogMessage( hwnd, &msg ) ){
					TranslateMessage( &msg );
					DispatchMessage( &msg );
				}
			}
			// メインフォーム有効
			EnableWindow( MainForm, TRUE );
			// なぜか隠れてしまうので最前面にする
			// TODO:「キャンセル」はいいけど「OK」で隠れてしまう事しばしば発生なぜだ
			SetForegroundWindow( MainForm );
			BringWindowToTop( MainForm );
			SetActiveWindow( MainForm );
			SetFocus( MainForm );
		}
		else LogW(L"CreateWindowエラー");
		UnregisterClassW( CONFIGDLGCLASS, hinst );
	}
	else LogW(L"RegisterClassエラー");

	return data.result;
}











//---------------------------------------------------------------------------------------------------------------
// ブラウザ起動アイコンボタン
void BrowserIconDestroy( BrowserIcon br[BI_COUNT] )
{
	if( br ){
		UINT i;
		for( i=0; i<BI_COUNT; i++ ){
			if( br[i].hwnd ) DestroyWindow( br[i].hwnd );
			if( br[i].icon ) DestroyIcon( br[i].icon );
			if( br[i].text ) free( br[i].text );
		}
		free( br );
	}
}
// ブラウザアイコンボタン作成
// ボタンにアイコンを表示する
// http://keicode.com/windows/ui03.php
#define BUTTON_WIDTH	36		// ボタン縦横ピクセル
BrowserIcon* BrowserIconCreate( void )
{
	BrowserIcon* ico = malloc( sizeof(BrowserIcon)*BI_COUNT );
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
					// アイコン
					ico[i].icon = FileIconLoad( br[i].exe );
					// ツールチップ用文字列
					ico[i].text = wcsdup( br[i].name );
					// ボタン
					ico[i].hwnd = CreateWindowW(
									L"button", L""
									,WS_CHILD |WS_VISIBLE |BS_ICON |BS_FLAT |WS_TABSTOP
									,left, 0, BUTTON_WIDTH, BUTTON_WIDTH
									,MainForm
									,(HMENU)BrowserCommand(i)	// WM_COMMANDのLOWORD(wp)に入る数値
									,hinst, NULL
					);
					if( ico[i].hwnd ){
						if( ico[i].icon ){
							SendMessage( ico[i].hwnd, BM_SETIMAGE, IMAGE_ICON, (LPARAM)ico[i].icon );
						}
						else if( br[i].exe ){
							// エラーアイコン
							SendMessage( ico[i].hwnd, BM_SETIMAGE, IMAGE_ICON, (LPARAM)LoadIcon(NULL,IDI_ERROR) );
						}
					}
					else LogW(L"L%u:CreateWindowエラー%u",__LINE__,GetLastError());
					// 次
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
	BrowserInfo* br = BrowserInfoAlloc(); // TODO:1個だけでいいのに全部取得してるムダ
	if( br ){
		if( br[ix].exe ){
			WCHAR* exe = myPathResolve( br[ix].exe );
			if( exe ){
				size_t cmdlen = wcslen(exe) + (br[ix].arg?wcslen(br[ix].arg):0) + 32;
				WCHAR* cmd = malloc( cmdlen * sizeof(WCHAR) );
				WCHAR* dir = wcsdup( exe );
				if( cmd && dir ){
					STARTUPINFOW si;
					PROCESS_INFORMATION pi;
					DWORD err=0;
					WCHAR* p;
					memset( cmd, 0, cmdlen * sizeof(WCHAR) );
					memset( &si, 0, sizeof(si) );
					memset( &pi, 0, sizeof(pi) );
					si.cb = sizeof(si);
					// コマンドライン全体
					_snwprintf(cmd,cmdlen
							,L"\"%s\" %s http%s://localhost:%s/"
							,exe
							,br[ix].arg? br[ix].arg :L""
							,HttpsLocal? L"s" :L""
							,ListenPort
					);
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
						_snwprintf(cmd,cmdlen
								,L"%s http%s://localhost:%s/"
								,br[ix].arg? br[ix].arg :L""
								,HttpsLocal? L"s" :L""
								,ListenPort
						);
						err = (DWORD)ShellExecuteW( NULL,NULL, exe, cmd, dir, SW_SHOWNORMAL );
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
	if( empty || invalid ) PostMessage( MainForm ,WM_CONFIG_DIALOG ,(WPARAM)ConfigDialog(ix+1) ,0 ); 
}
// ツールチップ
// http://wisdom.sakura.ne.jp/system/winapi/common/common10.html
// http://rarara.cafe.coocan.jp/cgi-bin/lng/vc/vclng.cgi?print+200310/03100084.txt
// http://hpcgi1.nifty.com/MADIA/Vcbbs/wwwlng.cgi?print+201004/10040016.txt
// TOOLINFOW構造体サイズ(がcomctl32.dllバージョンによって変わるので変数保持)
size_t sizeofTOOLINFOW = sizeof(TOOLINFOW);

HWND BrowserIconTipCreate( const BrowserIcon* browser )
{
	HWND hToolTip = NULL;
	if( browser ){
		HINSTANCE hinst = GetModuleHandle(NULL);
		hToolTip = CreateWindowW(
						TOOLTIPS_CLASSW, NULL
						,TTS_ALWAYSTIP |TTS_NOPREFIX |TTS_BALLOON
						,CW_USEDEFAULT, CW_USEDEFAULT
						,CW_USEDEFAULT, CW_USEDEFAULT
						,MainForm, 0, hinst, NULL
		);
		if( hToolTip ){
			TOOLINFOW ti;
			UINT i;
			SendMessage( hToolTip, TTM_SETDELAYTIME, TTDT_INITIAL, 100 );
			memset( &ti, 0, sizeofTOOLINFOW );
			ti.cbSize = sizeofTOOLINFOW;
			ti.uFlags = TTF_SUBCLASS |TTF_CENTERTIP;
			ti.hinst = hinst;
			for( i=0; i<BI_COUNT; i++ ){
				if( browser[i].hwnd ){
					ti.lpszText = browser[i].text;
					ti.hwnd = browser[i].hwnd;
					ti.uId = i;
					GetClientRect( browser[i].hwnd, &ti.rect );
					SendMessage( hToolTip, TTM_ADDTOOL, 0, (LPARAM)&ti );
				}
			}
		}
	}
	return hToolTip;
}











//---------------------------------------------------------------------------------------------------------------
// メインフォーム関連
//
// サーバログをファイル保存
void LogSave( void )
{
	LONG count = SendMessage( ListBox, LB_GETCOUNT, 0,0 );
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
			HANDLE hFile = CreateFileW( wpath, GENERIC_WRITE, FILE_SHARE_READ
								,NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL
			);
			if( hFile !=INVALID_HANDLE_VALUE ){
				LONG i;
				for( i=0; i<count; i++ ){
					WCHAR wstr[ LOGMAX +1 ]=L"";
					UCHAR utf8[ LOGMAX *2 +1 ]="";
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
			else LogW(L"L%u:CreateFile(%s)エラー%u",__LINE__,wpath,GetLastError());
		}
	}
}
// 1秒毎の処理
void MainFormTimer1000( void )
{
	// ログキャッシュをListBoxに吐き出してメモリ解放。
	LONG cxMax=0;
	LogCache* lc;
	// 現在のキャッシュをローカルに取得してグローバル変数は空にする。
	// CS解放した後はスレッド(のログ関数)が止まらず動ける。
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
		SendMessage( ListBox, LB_SETHORIZONTALEXTENT, cxMax +20, 0 );	// +20 適当余白
	}
	// タイトルバー更新
	{
		WCHAR text[128]=L"";
		WCHAR mem[32]=L"";	// メモリ使用量文字列
		PROCESS_MEMORY_COUNTERS pmc;

		memset( &pmc, 0, sizeof(pmc) );
		if( GetProcessMemoryInfo( ThisProcess, &pmc, sizeof(pmc) ) )
			_snwprintf(mem,sizeof(mem)/sizeof(WCHAR),L" (PF %u KB)",pmc.PagefileUsage /1024);

		if( ListenSock1==INVALID_SOCKET && ListenSock2==INVALID_SOCKET )
			_snwprintf(text,sizeof(text)/sizeof(WCHAR),L"%s - エラー%s",APPNAME,mem);
		else
			_snwprintf(text,sizeof(text)/sizeof(WCHAR)
					,L"%s - http%s://localhost:%s/%s"
					,APPNAME
					,(HttpsRemote && HttpsLocal)? L"s" : (HttpsRemote || HttpsLocal)? L"(s)" :L""
					,ListenPort
					,mem
			);

		SetWindowTextW( MainForm, text );
	}
	// 無通信監視
	// keep-alive無効で無通信のまま接続が残ってしまう場合としてクライアントがContent-Lengthぶんの
	// データを送ってこない異常時が考えられるが、ほとんど発生しないためタイムアウトはそれほど短く
	// ない分単位でよさそう。だがkeep-alive有効の場合は普通にFirefoxが何本も接続を切らないまま居
	// 座りやがるので10秒くらいで切断したくなる。が、短すぎると他に問題が発生しないか気がかり。
	{
		int i;
		for( i=CLIENT_MAX-1; i>=0; i-- ){
			if( Client[i].sock !=INVALID_SOCKET ){
				TClient* cp = &(Client[i]);
				cp->silent++;
#ifdef HTTP_KEEPALIVE
				if( (cp->status==CLIENT_KEEP_ALIVE && cp->silent >10) || // 10秒
					(cp->status!=CLIENT_KEEP_ALIVE && cp->silent >60) ){ // 1分
#else
				if( cp->silent >60 ){ // 1分
#endif
					if( cp->status==CLIENT_THREADING ){
						// スレッド終了待たないとアクセス違反で落ちる
						cp->abort = 1;
						LogW(L"[%u]スレッド実行中待機...(無通信)",i);
					}
					else{
						LogW(L"[%u]切断(%s)",i,(cp->status==CLIENT_KEEP_ALIVE)?L"keep-alive":L"無通信");
						ClientShutdown( cp );
					}
				}
			}
		}
	}
}
// アプリ起動時の(致命的ではない)初期化処理。ウィンドウ表示されているのでウイルス対策ソフトで
// Listenを止められてもアプリ起動したことがわかる(わざわざ独自メッセージにした理由はそれくらい)。
// スタック1KB以上使うので関数化。
void MainFormCreateAfter( HINSTANCE hinst, BrowserIcon** browser, HWND* hToolTip )
{
	UCHAR path[MAX_PATH+1];
	WCHAR wpath[MAX_PATH+1];
	// タイマー起動
	SetTimer( MainForm, TIMER1000, 1000, NULL );
	// ブラウザ起動ボタン
	*browser = BrowserIconCreate();
	*hToolTip = BrowserIconTipCreate( *browser );
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
	// OpenSSL
	SSL_library_init();
	ssl_ctx = SSL_CTX_new( SSLv23_method() );	// SSLv2,SSLv3,TLSv1すべて利用
	if( ssl_ctx ){
		// PFS(Perfect Forword Security)
		// 鍵交換にECDHE(Elliptic Curve Diffie-Hellman Ephemeral/Exchange)を使う。
		// http://blog.livedoor.jp/k_urushima/archives/1728348.html
		// openssl-1.0.0j/apps/s_server.c のECDH関連コードを参考に。
		// Chromeで確認すると鍵交換が「RSA」から「ECDHE-RSA」に変わった。これでいいのか？
		EC_KEY* ecdh = EC_KEY_new_by_curve_name( NID_X9_62_prime256v1 );
		if( ecdh ){
			SSL_CTX_set_tmp_ecdh( ssl_ctx ,ecdh );
			EC_KEY_free( ecdh );
		}
		else LogW(L"EC_KEY_new_by_curve_name() failed");
		SSL_CertLoad();
	}
	else LogW(L"SSL_CTX_newエラー");
	// クライアント初期化
	{ UINT i; for( i=0; i<CLIENT_MAX; i++ ) ClientInit( &(Client[i]) ); }
	// 待受開始
	for( ;; ){
		// listen成功でループ抜け
		if( ListenStart() ) break;
		ErrorBoxW(L"このポート番号は他で使われているかもしれません。");
		// listenエラー設定ダイアログ出す
		if( ConfigDialog(0)==ID_DLG_CANCEL ) break;
		// ダイアログOK、listenリトライ
	}
	// タイマー処理
	MainFormTimer1000();
	// v1.8で無くなったファイル削除
	_snwprintf(wpath,sizeof(wpath)/sizeof(WCHAR),L"%s\\save.png",DocumentRoot);
	DeleteFileW(wpath);
	_snwprintf(wpath,sizeof(wpath)/sizeof(WCHAR),L"%s\\saveshot.png",DocumentRoot);
	DeleteFileW(wpath);
}
// タスクトレイアイコン登録
// http://www31.ocn.ne.jp/~yoshio2/vcmemo17-1.html
// http://kara.ifdef.jp/program/c/c03.html
// http://homepage1.nifty.com/MADIA/vc/vc_bbs/200801/200801_08010015.html
// http://blog.livedoor.jp/blackwingcat/archives/1528756.html
BOOL TrayIconNotify( HWND hwnd, UINT msg )
{
	NOTIFYICONDATAW ni;

	memset( &ni, 0, sizeof(ni) );
	ni.cbSize = sizeof(ni);
	ni.hWnd = hwnd;

	switch( msg ){
	case NIM_ADD:
		ni.uFlags			= NIF_ICON |NIF_MESSAGE |NIF_TIP |NIF_INFO;
		ni.hIcon			= LoadIconA( GetModuleHandle(NULL), "0" );
		ni.uCallbackMessage	= WM_TRAYICON;
		//GetWindowTextW( hwnd, ni.szTip, sizeof(ni.szTip) );
		wcscpy( ni.szTip, APPNAME );
		wcscpy( ni.szInfoTitle, APPNAME );				// バルーンタイトル
		wcscpy( ni.szInfo, L"アイコン化しています" );	// バルーンメッセージ
		Shell_NotifyIconW( NIM_ADD, &ni );
		// 登録結果はNIM_MODIFYで確認
		ni.uFlags = NIF_TIP;
		if( Shell_NotifyIconW( NIM_MODIFY, &ni ) ){
			// 数秒でバルーン消す
			// timeSetEvent(TIME_ONESHOT)で指定時間後に一発だけ実行できるようだが、まあいいか…。
			// Win7でメッセージ読めないのでVista以降はちょい長めに表示する。
			UINT msec = 1000;
			OSVERSIONINFOA os;
			memset( &os, 0, sizeof(os) );
			os.dwOSVersionInfoSize = sizeof(os);
			GetVersionExA( &os );
			if( os.dwMajorVersion>=6 ) msec = 1500; // Vista以降
			SetTimer( hwnd, TIMER_BALOON, msec, NULL );
			return TRUE;
		}
		return FALSE;

	case NIM_MODIFY:
		ni.uFlags = NIF_TIP |NIF_INFO;
		wcscpy( ni.szTip, APPNAME );

	case NIM_DELETE:
		return Shell_NotifyIconW( msg, &ni );
	}
	return FALSE;
}
// バージョン情報ダイアログ
LRESULT CALLBACK AboutBoxProc( HWND hwnd, UINT msg, WPARAM wp, LPARAM lp )
{
	switch( msg ){
	case WM_CREATE:
		{
			HINSTANCE hinst = ((LPCREATESTRUCT)lp)->hInstance;
			HFONT hFont = CreateFontA(17,0,0,0,0,0,0,0,0,0,0,0,0,"MS P Gothic");
			HWND hTxt;
			WCHAR wtxt[256]=L"";
			UCHAR libs[128]="";
			WCHAR* wlibs;

			_snprintf(libs,sizeof(libs),
					"zlib %s\r\n" "SQLite %s\r\n" "%s"
					,ZLIB_VERSION
					,SQLITE_VERSION
					,SSLeay_version(SSLEAY_VERSION)
			);
			wlibs = MultiByteToWideCharAlloc( libs, CP_UTF8 );
			if( wlibs ){
				OSVERSIONINFOA os;
				memset( &os, 0, sizeof(os) );
				os.dwOSVersionInfoSize = sizeof(os);
				GetVersionExA( &os );
				_snwprintf(wtxt,sizeof(wtxt)/sizeof(WCHAR),
						L"%s\r\n\r\n" L"%s\r\n\r\n" L"Windows%s %u.%u"
						,APPNAME, wlibs
						// Windowsバージョン情報の取得
						// http://www.westbrook.jp/Tips/Win/OSVersion.html
						,(os.dwPlatformId==VER_PLATFORM_WIN32_NT)?L"NT":L""
						,os.dwMajorVersion, os.dwMinorVersion
				);
				free( wlibs );
			}
			// アイコン
			SendMessage(
				CreateWindowW(
					L"static", L""
					,WS_CHILD |WS_VISIBLE |SS_ICON
					,10,10,32,32, hwnd,NULL, hinst,NULL
				)
				,STM_SETICON, (WPARAM)LoadIconA(hinst,"0"), 0
			);
			// テキスト
			hTxt = CreateWindowW(
						L"edit", wtxt
						,ES_LEFT |ES_MULTILINE |WS_CHILD |WS_VISIBLE
						,60,10,230,126 ,hwnd,NULL ,hinst,NULL
			);
			SendMessage( hTxt, WM_SETFONT, (WPARAM)hFont, 0 );
			SendMessage( hTxt, EM_SETREADONLY, TRUE, 0 );
			// ボタン
			SendMessage(
				CreateWindowW(
					L"button", L"閉じる"
					,WS_CHILD |WS_VISIBLE |WS_TABSTOP
					,100,140,100,36
					,hwnd, (HMENU)ID_DLG_CLOSE
					,hinst, NULL
				)
				,WM_SETFONT, (WPARAM)hFont, 0
			);
		}
		break;

	case WM_COMMAND:
		if( LOWORD(wp)==ID_DLG_CLOSE ) DestroyWindow( hwnd );
		return 0;

	case WM_SYSCOMMAND:
		// Alt+F4で閉じる。ちなみにConfigDialog()はこの処理がなくてもなぜかAlt+F4で閉じる。
		// なぜかConfigDialogではWM_COMMAND/ID_DLG_CANCELメッセージも(頼んでないのに)飛んで
		// くるようだ。なんで？？？
		if( LOWORD(wp)==SC_CLOSE ) DestroyWindow( hwnd );
		break;

	case WM_DESTROY:
		PostQuitMessage(0);
		return 0;
	}
	return DefDlgProc( hwnd, msg, wp, lp );
}
void AboutBox( void )
{
	#define ABOUTBOXCLASS L"JCBookmarkAboutBox"
	HINSTANCE hinst = GetModuleHandle(NULL);
	WNDCLASSEXW	wc;

	memset( &wc, 0, sizeof(wc) );
	wc.cbSize        = sizeof(wc);
	wc.cbWndExtra	 = DLGWINDOWEXTRA;
	wc.lpfnWndProc   = AboutBoxProc;
	wc.hInstance     = hinst;
	wc.hIcon	     = LoadIconA( hinst, "0" );
	wc.hCursor	     = LoadCursor(NULL,IDC_ARROW);
	wc.hbrBackground = (HBRUSH)(COLOR_BTNFACE+1);
	wc.lpszClassName = ABOUTBOXCLASS;

	if( RegisterClassExW(&wc) ){
		HWND hwnd = CreateWindowW(
						ABOUTBOXCLASS
						,L"バージョン情報"
						,WS_OVERLAPPED |WS_CAPTION |WS_THICKFRAME |WS_VISIBLE
						,GetSystemMetrics(SM_CXFULLSCREEN)/2 - 300/2
						,GetSystemMetrics(SM_CYFULLSCREEN)/2 - 220/2
						,300, 220
						,MainForm,NULL
						,hinst,NULL
		);
		if( hwnd ){
			MSG msg;
			// メインフォーム無効
			EnableWindow( MainForm, FALSE );
			// ダイアログ閉じるまでループ
			while( GetMessage(&msg,NULL,0,0) >0 ){
				if( !IsDialogMessage( hwnd, &msg ) ){
					TranslateMessage( &msg );
					DispatchMessage( &msg );
				}
			}
			// メインフォーム有効
			EnableWindow( MainForm, TRUE );
			// なぜか隠れてしまうので最前面にする
			// TODO:隠れてしまう事しばしば発生なぜだ
			SetForegroundWindow( MainForm );
			BringWindowToTop( MainForm );
			SetActiveWindow( MainForm );
			SetFocus( MainForm );
		}
		else LogW(L"CreateWindowエラー");
		UnregisterClassW( ABOUTBOXCLASS, hinst );
	}
	else LogW(L"RegisterClassエラー");
}
// メインフォームWindowProc
LRESULT CALLBACK MainFormProc( HWND hwnd, UINT msg, WPARAM wp, LPARAM lp )
{
	static BrowserIcon*	browser			=NULL;
	static UINT			taskbarRestart	=0;
	static HWND			hToolTip		=NULL;
	static HFONT		hFont			=NULL;

	switch( msg ){
	case WM_CREATE:
		// 起動中止するレベルの致命的エラーを含む一次初期化
		MainForm = hwnd;
		// タスクトレイアイコン消える対策
		taskbarRestart = RegisterWindowMessageW(L"TaskbarCreated");
		// リストボックス
		ListBox = CreateWindowExW(
					WS_EX_CLIENTEDGE
					,L"listbox", L""
					,WS_CHILD |WS_VISIBLE |WS_VSCROLL |WS_HSCROLL
					,0,0,0,0
					,hwnd, 0
					,((LPCREATESTRUCT)lp)->hInstance, NULL
		);
		if( !ListBox ) return -1;
		hFont = CreateFontW(15,0,0,0,0,0,0,0,0,0,0,0,0,L"MS Gothic");
		if( !hFont ) return -1;
		SendMessage( ListBox, WM_SETFONT, (WPARAM)hFont, 0 );
		// リストボックス横幅計算のためデバイスコンテキスト取得フォント関連付け
		ListBoxDC = GetDC( ListBox );
		if( !ListBoxDC ) return -1;
		SelectObject( ListBoxDC, hFont );
		// プロセスハンドル
		ThisProcess = OpenProcess( PROCESS_QUERY_INFORMATION, FALSE, GetCurrentProcessId() );
		if( !ThisProcess ) return -1;
		// 二次初期化
		PostMessage( hwnd, WM_CREATE_AFTER, (WPARAM)(((LPCREATESTRUCT)lp)->hInstance), 0 );
		break;

	case WM_CREATE_AFTER:
		MainFormCreateAfter( (HINSTANCE)wp, &browser, &hToolTip );
		return 0;

	case WM_TRAYICON_ADD:
		// 起動時のタスクトレイ収納およびタスクバークラッシュ時のアイコン登録。
		// Windowsログイン時スタートアップフォルダから起動するとアイコン登録できない場合
		// がある(1分間くらいエラーになり続けて成功した例あり)対策のため無限ループ。
		// http://www.geocities.jp/midorinopage/Tips/tasktray.html
		if( !TrayIconNotify( hwnd, NIM_ADD ) ){
			Sleep(2000);
			PostMessage( hwnd, WM_TRAYICON_ADD, 0,0 );
		}
		return 0;

	case WM_SIZE:
		// なぜか下に隙間ができる。Listboxの縦方向が1行単位でしか大きさが変わらないようだ。
		MoveWindow( ListBox, 0, BUTTON_WIDTH, LOWORD(lp), HIWORD(lp)-BUTTON_WIDTH, TRUE );
		break;

	case WM_SYSCOMMAND:
		switch( LOWORD(wp) ){
		case SC_MINIMIZE:	// 最小化
			// タスクトレイに収納
			if( TrayIconNotify( hwnd, NIM_ADD ) ){
				ShowWindow( hwnd, SW_MINIMIZE );	// 最小化するとワーキングセット減る
				ShowWindow( hwnd, SW_HIDE );		// 非表示
			}
			else ErrorBoxW(L"タスクトレイ(通知領域)に登録できません");
			return 0;
		case SC_CLOSE:		// 閉じる
			DestroyWindow( hwnd );
			return 0;
		}
		break;

	case WM_TRAYICON: // タスクトレイアイコンクリック
		switch( lp ){
		case WM_LBUTTONUP:
		case WM_RBUTTONUP:
			// タスクトレイから復帰
			ShowWindow( hwnd, SW_SHOW );
			ShowWindow( hwnd, SW_RESTORE );
			SetForegroundWindow( hwnd );
			TrayIconNotify( hwnd, NIM_DELETE );
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
			AppendMenuW( menu, MF_STRING, CMD_ABOUT, L"バージョン情報" );
			AppendMenuW( menu, MF_STRING, CMD_EXIT, L"終了" );
			SetForegroundWindow( hwnd );
			TrackPopupMenu( menu, 0, LOWORD(lp), HIWORD(lp), 0, hwnd, NULL );
			PostMessage( hwnd, WM_NULL, 0,0 );
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
			SendMessage( ListBox, LB_RESETCONTENT, 0,0 );
			SendMessage( ListBox, LB_SETHORIZONTALEXTENT, 0,0 );
			ListBoxWidth = 0;
			break;
		case CMD_SETTING:	// 設定
			PostMessage( hwnd ,WM_CONFIG_DIALOG ,(WPARAM)ConfigDialog(0) ,0 );
			break;
		case CMD_ABOUT:		// バージョン情報
			AboutBox();
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

	case WM_CONFIG_DIALOG: // 設定ダイアログ後処理
		{
			if( wp==ID_DLG_OK ){
				WCHAR	oldPort[8];
				BOOL	oldBindLocal = BindLocal;		// bind設定退避
				wcscpy( oldPort, ListenPort );			// 現在ポート退避
				ServerParamGet();
				SSL_CertLoad();
				if( oldBindLocal!=BindLocal || wcscmp(oldPort,ListenPort) ){
					// bind設定orポート番号変わった
					BOOL success;
					SocketShutdown();					// コネクション切断
					success = ListenStart();			// 待ち受け開始
					MainFormTimer1000();				// タイトルバー
					// Listen失敗時は再び設定ダイアログ
					if( !success ) PostMessage( hwnd, WM_COMMAND, MAKEWPARAM(CMD_SETTING,0), 0 );
				}
				DestroyWindow( hToolTip );
				BrowserIconDestroy( browser );
				browser = BrowserIconCreate();
				hToolTip = BrowserIconTipCreate( browser );
			}
			else SSL_CertLoad();
		}
		return 0;

	case WM_SOCKET: // ソケットイベント
		// wp = イベントが発生したソケット(SOCKET)
		// WSAGETSELECTEVENT(lp) = ソケットイベント番号(WORD)
		// WSAGETSELECTERROR(lp) = エラー番号(WORD)
		if( WSAGETSELECTERROR(lp) ) LogW(L"[:%u]ソケットイベントエラー%u",(SOCKET)wp,WSAGETSELECTERROR(lp));
		switch( WSAGETSELECTEVENT(lp) ){
		//	http://members.jcom.home.ne.jp/toya.hiroshi/winsock2/index.html?wsaasyncselect_2.html
		//case FD_CONNECT: break; // connect成功した
		case FD_ACCEPT: SocketAccept( (SOCKET)wp );			break; // acceptできる
		case FD_READ  : SocketRead( (SOCKET)wp, browser );	break; // recvできる
		case FD_WRITE : SocketWrite( (SOCKET)wp );			break; // sendできる
		case FD_CLOSE : SocketClose( (SOCKET)wp );			break; // 接続は閉じられた
		default: LogW(L"[:%u]不明なソケットイベント(%u)",(SOCKET)wp,WSAGETSELECTEVENT(lp));
		}
		return 0;

	case WM_THREADFIN: // スレッド終了
		{
			TClient* cp = ClientOfSocket( (SOCKET)wp );
			if( cp ){
				CloseHandle( cp->thread ), cp->thread=NULL;
				if( cp->abort ){
					LogW(L"[%u]中断します...",Num(cp));
					cp->status = 0;
				}
				else{
					// 応答送信
					cp->status = CLIENT_SEND_READY;
					ClientWrite( cp );
				}
			}
		}
		return 0;

	case WM_TIMER:
		switch( wp ){
		case TIMER1000:
			MainFormTimer1000();
			break;
		case TIMER_BALOON: // タスクトレイバルーン消去
			KillTimer( hwnd, TIMER_BALOON );
			TrayIconNotify( hwnd, NIM_MODIFY );
			break;
		}
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
	// タスクトレイアイコン消える対策
	// http://www.geocities.jp/midorinopage/Tips/tasktray.html
	if( msg==taskbarRestart && !IsWindowVisible(hwnd) ) PostMessage( hwnd, WM_TRAYICON_ADD, 0,0 );
	return DefDlgProc( hwnd, msg, wp, lp );
}
// アプリ起動時
HWND Startup( HINSTANCE hinst, int nCmdShow )
{
	WSADATA	wsaData;

	WSAStartup( MAKEWORD(2,2), &wsaData );
	InitializeCriticalSection( &LogCacheCS );
	InitializeCriticalSection( &SessionCS );
	InitCommonControls();
	// comctl32.dllバージョン確認、TOOLINFOW構造体サイズ決定
	{
		// ツールチップがぜんぜん動かないので調べた結果、ツールチップ表示で使うTOOLINFOW構造体は
		// comctl32.dllのバージョン5と6でサイズが異なり、コンパイル時はver6のつもりでも実行時は
		// ver5(のcomctl32.dll)がロードされてしまい、構造体サイズが不正となる結果、ツールチップ
		// が動かないという事らしい。
		//   Unicode環境で、ツールチップを利用するには？
		//   http://hpcgi1.nifty.com/MADIA/Vcbbs/wwwlng.cgi?print+201008/10080005.txt
		//   Adding tooltip controls in unicode fails
		//   http://social.msdn.microsoft.com/Forums/en-US/vclanguage/thread/5cc9a772-5174-4180-a1ca-173dc81886d9
		//   ツールチップ と コモンコントロール のバージョン差異による落とし穴
		//   http://ameblo.jp/blueskyame/entry-10398978729.html
		// 対策は「マニフェストファイルを作ってver6をロードする」方式がまず見つかる。これはXPの
		// Lunaスタイルをアプリに適用するための話と同じになるもよう。
		//   自作のプログラムを Windows XP のビジュアルスタイルに対応させる
		//   http://www.koutou-software.co.jp/junk/apply-winxp-visualstyle.html
		// マニフェスファイルとかウゼーいらねーということで…今回はcmctl32.dllをロードしてバージ
		// ョン確認し、TOOLINFOW構造体サイズを調節することにする。
		//   Common Control Versions (Windows)
		//   http://msdn.microsoft.com/en-us/library/windows/desktop/hh298349(v=vs.85).aspx
		//   DllGetVersion function (Windows)
		//   http://msdn.microsoft.com/ja-jp/library/windows/desktop/bb776404(v=vs.85).aspx
		#define PACKVERSION(major,minor) MAKELONG(minor,major)
		DWORD dwVersion=0;
		HINSTANCE dll = LoadLibraryW( L"comctl32.dll" );
		if( dll )
		{
			DLLGETVERSIONPROC GetVersion = (DLLGETVERSIONPROC)GetProcAddress(dll,"DllGetVersion");
			if( GetVersion ){
				DLLVERSIONINFO dvi;
				HRESULT hr;
				memset( &dvi, 0, sizeof(dvi) );
				dvi.cbSize = sizeof(dvi);
				hr = GetVersion( &dvi );
				if( SUCCEEDED(hr) ) dwVersion = PACKVERSION(dvi.dwMajorVersion, dvi.dwMinorVersion);
			}
			FreeLibrary( dll );
		}
		if( dwVersion<PACKVERSION(6,0) ) sizeofTOOLINFOW -= sizeof(void*);
	}
	// ドキュメントルート(exeフォルダ\\root)
	{
		size_t length = 32;
		WCHAR* wpath = NULL;
		while( !wpath ){
			wpath = malloc( length * sizeof(WCHAR) );
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
				ErrorBoxW(L"L%u:malloc(%u)エラー",__LINE__,length*sizeof(WCHAR));
				return NULL;
			}
		}
	}
	// メインフォーム生成
	{
		#define MAINFORMCLASS L"JCBookmarkMainForm"
		WNDCLASSEXW	wc;

		memset( &wc, 0, sizeof(wc) );
		wc.cbSize        = sizeof(wc);
		wc.cbWndExtra	 = DLGWINDOWEXTRA;
		wc.lpfnWndProc   = MainFormProc;
		wc.hInstance     = hinst;
		wc.hIcon	     = LoadIconA( hinst, "0" );
		wc.hCursor	     = LoadCursor(NULL,IDC_ARROW);
		wc.hbrBackground = (HBRUSH)(COLOR_BTNFACE+1);
		wc.lpszClassName = MAINFORMCLASS;

		if( RegisterClassExW(&wc) ){
			HWND hwnd = CreateWindowW(
							MAINFORMCLASS
							,APPNAME
							,WS_OVERLAPPEDWINDOW |WS_CLIPCHILDREN
							,CW_USEDEFAULT, CW_USEDEFAULT, 600, 400
							,NULL, NULL, hinst, NULL
			);
			if( hwnd ){
				ServerParamGet();
				if( BootMinimal ){
					// 起動時にタスクトレイに収納する
					PostMessage( hwnd, WM_TRAYICON_ADD, 0,0 );
				}
				else{
					ShowWindow( hwnd, nCmdShow );
					UpdateWindow( hwnd );
				}
				return hwnd;
			}
			else ErrorBoxW(L"L%u:CreateWindowエラー",__LINE__);
		}
		else ErrorBoxW(L"L%u:RegisterClassエラー",__LINE__);
	}
	return NULL;
}
// アプリ終了時
void Cleanup( void )
{
	LogCache* lc = LogCache0;
	Session* sp = Session0;
	while( sp ){
		Session* next = sp->next;
		free( sp );
		sp = next;
	}
	while( lc ){
		LogCache* next = lc->next;
		free( lc );
		lc = next;
	}
	DeleteCriticalSection( &LogCacheCS );
	DeleteCriticalSection( &SessionCS );
	free( DocumentRoot );
	WSACleanup();
#ifdef MEMLOG
	if( mlog ) fclose(mlog);
#endif
}

int WINAPI wWinMain( HINSTANCE hinst, HINSTANCE hinstPrev, LPWSTR lpCmdLine, int nCmdShow )
{
	MSG msg = {0};

	if( Startup( hinst, nCmdShow ) ){
		while( GetMessage( &msg, NULL, 0,0 ) >0 ){
			if( !IsDialogMessage( MainForm, &msg ) ){
				TranslateMessage( &msg );
				DispatchMessage( &msg );
			}
		}
	}
	Cleanup();
	return (int)msg.wParam;
}
