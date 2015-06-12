// vim:set ts=4 noexpandtab:vim modeline
(function( $, win, doc, oStr, IE ){
'use strict';
/*
var $debug = $('<div></div>').css({
	position:'fixed'
	,left:0
	,top:0
	,width:100
	,background:'#fff'
	,border:'1px solid #000'
	,padding:0
}).appendTo(doc.body);
*/
$.ajaxSetup({
	// ブラウザキャッシュ(主にIE)対策 http://d.hatena.ne.jp/hasegawayosuke/20090925/p1
	headers:{'If-Modified-Since':'Thu, 01 Jun 1970 00:00:00 GMT'}
});
// jQueryツールチップ
$.fn.tooltip = function(){
	return this.each(function(){
		$(this).hover(function(){
			var $this = $(this);
			var txt = $this.attr('data-tip');
			if( txt.length ){
				var $tip = $('#tooltip');
				var $horn1 = $tip.children('b');
				var $horn2 = $tip.children('i');
				var ofTip = $this.offset();
				var ofHorn1 = { left:ofTip.left };
				$tip.children('div').text( txt );
				// 下に表示
				ofTip.left += $this.outerWidth() / 2 - $tip.outerWidth() / 2;
				ofTip.top += $this.outerHeight();
				if( ofTip.left <0 ) ofTip.left = 0;
				else{
					var w = ofTip.left + $tip.outerWidth() - $(win).width();
					if( w >0 ) ofTip.left -= w;
				}
				ofHorn1.left = ofHorn1.left - ofTip.left + $this.outerWidth() / 2 - $horn1.outerWidth() / 2;
				ofHorn1.top = - $horn1.outerHeight() / 2;
				if( IE && IE<8 ) ofHorn1.top -= 18; // IE7用詳細不明
				$horn1.css({ left:ofHorn1.left ,top:ofHorn1.top });
				$horn2.css({ left:ofHorn1.left + 2 ,top:ofHorn1.top + 4 });
				$tip.css({ left:ofTip.left ,top:ofTip.top ,'padding-top':$horn2.outerHeight() / 2 - 3 }).show();
			}
		},function(){
			$('#tooltip').hide();
		});
	});
};
var isLocalServer = true;		// ローカルHTTPサーバー(通常)
var select = null;				// 選択フォルダorアイテム
var selectFolder = null;		// 選択フォルダ
var selectItemLast = null;		// 最後に単選択(通常クリックおよびCtrl+クリック)したアイテム
var draggie = null;				// ドラッグしている要素
var dragItem = {};				// 複数選択ドラッグ情報
var busyLoopCount = 10;			// ビジーループ回数
var tree = {
	// ルートノード
	root:null
	// 変更されてるかどうか
	,_modified:false
	,modified:function( on ){
		if( arguments.length ){
			if( on && !tree._modified ){
				if( tree.modifing() ){
					$('#modified').hide();
					$('#progress').show();
				}
				else{
					$('#progress').hide();
					$('#modified').show();
				}
				var h = $('#modified').outerHeight();
				$(doc.body).css('padding-top',h);
				resizeV( h );
			}
			tree._modified = on;
			return tree;
		}
		return tree._modified;
	}
	// 変更中(完了待ち)かどうか(カウンタ方式)
	,_modifing:0
	,modifing:function( on ){
		if( arguments.length ){
			if( on ) tree._modifing++;
			else if( tree._modifing >0 ) tree._modifing--;
			if( tree.modified() ){
				if( tree._modifing ){
					$('#modified').hide();
					$('#progress').show();
				}
				else{
					$('#progress').hide();
					$('#modified').show();
				}
			}
			return tree;
		}
		return ( tree._modifing >0 );
	}
	// ルートノード差し替え
	,replace:function( data ){
		if( tree.root ) tree.modified(true);
		tree.root = data;
		return tree;
	}
	// トップノード取得
	,top:function(){ return tree.root.child[0]; }
	// ごみ箱ノード取得
	,trash:function(){ return tree.root.child[1]; }
	// 指定ノードIDのノードオブジェクト(ごみ箱も探す)
	,node:function( id ){
		return function callee( node ){
			if( node.id==id ){
				// 見つけた
				return node;
			}
			if( node.child ){
				for( var i=node.child.length; i--; ){
					var found = callee( node.child[i] );
					if( found ) return found;
				}
			}
			return null;
		}( tree.root );
	}
	// 指定ノードIDの親ノードオブジェクト
	,nodeParent:function( id ){
		return function callee( node ){
			for( var i=0, n=node.child.length; i<n; i++ ){
				if( node.child[i].id==id ){
					// 見つけた
					return node;
				}
				if( node.child[i].child ){
					var found = callee( node.child[i] );
					if( found ) return found;
				}
			}
			return null;
		}( tree.root );
	}
	// ノードAの子孫にノードBが存在したらtrueを返す
	// A,BはノードIDまたはノードオブジェクトどちらでも
	,nodeAhasB:function( A, B ){
		if( oStr.call(A)==='[object String]' ) A = tree.node(A);
		if( A && A.child ){
			return function callee( child ){
				for( var i=0, n=child.length; i<n; i++ ){
					// TODO:BがID文字列だった場合とノードオブジェクトだった場合
					// この判定方法でいいのかな…？
					if( child[i].id==B || child[i]===B ) return true;
					if( child[i].child ){
						if( callee( child[i].child ) ) return true;
					}
				}
				return false;
			}( A.child );
		}
		return false;
	}
	// 指定ノードIDがごみ箱にあるかどうか
	,trashHas:function( id ){ return tree.nodeAhasB( tree.trash(), id ); }
	// ごみ箱を空にする
	,trashEmpty:function(){
		if( tree.trash().child.length ){
			tree.trash().child.length = 0;
			tree.modified(true);
		}
	}
	// 新規フォルダ作成
	// title: フォルダ名
	// pnode: 親フォルダノードまたはノードID
	// index: 挿入位置配列インデックス
	,newFolder:function( title ,pnode ,index ){
		var node = {
			id			:tree.root.nextid++
			,dateAdded	:(new Date()).getTime()
			,title		:title || '新規フォルダ'
			,child		:[]
		};
		if( oStr.call(pnode)==='[object String]' ) pnode = tree.node(pnode);
		if( !pnode || !pnode.child ) pnode = tree.top() ,index=0;
		else if( !index ) index=0;
		pnode.child.splice( index ,0 ,node );
		tree.modified(true);
		return node;
	}
	// 新規ブックマーク作成
	// pnode: 親フォルダノード
	// index: 挿入位置配列インデックス
	,newURL:function( pnode, url, title, icon, index ){
		var node = {
			id			:tree.root.nextid++
			,dateAdded	:(new Date()).getTime()
			,title		:title || '新規ブックマーク'
			,url		:url || ''
			,icon		:icon || ''
		};
		if( !pnode || !pnode.child ) pnode = tree.top() ,index=0;
		else if( !index ) index=0;
		pnode.child.splice( index, 0, node );
		tree.modified(true);
		return node;
	}
	// 属性取得変更
	// id:ノードID文字列、attr:属性名文字列、value:属性値
	,nodeAttr:function( id, attr, value ){
		if( arguments.length <2 ) return null;
		if( arguments.length <3 ) return tree.node(id)[attr];
		var node = tree.node(id);
		if( node ){
			if( attr in node && node[attr]==value ) return 1;
			if( !(attr in node) && !value.length ) return 1;
			node[attr] = value;
			tree.modified(true);
			return 2;
		}
		return 0;
	}
	// ノードツリー取得
	,load:function( onSuccess ){
		$.ajax({
			dataType:'json'
			,url	:'tree.json'
			,error	:function(xhr){ Alert('データ取得できません:'+xhr.status+' '+xhr.statusText); }
			,success:function(data){
				tree.replace( data );
				if( onSuccess ) onSuccess();
			}
		});
	}
	// ノードツリー保存
	,save:function( arg ){
		$.ajax({
			type	:'put'
			,url	:'tree.json'
			,data	:JSON.stringify( tree.root )
			,error	:function(xhr){
				Alert('保存できません:'+xhr.status+' '+xhr.statusText);
				if( arg.error ) arg.error();
			}
			,success:function(){
				tree.modified(false);
				if( arg.success ) arg.success();
			}
		});
	}
	// 移動・消去してよいノードかどうか
	// id:ノードID
	,movable:function( id ){
		if( id==tree.root.id ) return false;
		if( id==tree.top().id ) return false;
		if( id==tree.trash().id ) return false;
		return true;
	}
	// ノード1個消去(ルート/トップ/ごみ箱ノードは消さない)
	// id:ノードID
	,eraseNode:function( id ){
		if( tree.movable(id) ){
			(function callee( child ){
				for( var i=0; i<child.length; i++ ){
					if( child[i].id==id ){
						// 見つけた消去
						child.splice(i,1);
						tree.modified(true);
						return true;
					}
					if( child[i].child ){
						if( callee( child[i].child ) ) return true;
					}
				}
			})( tree.root.child );
		}
		return false;
	}
	// ノード(フォルダ含む)消去(ルート/トップ/ごみ箱ノードは消さない)
	// ids:ノードID配列
	,eraseNodes:function( ids ){
		if( ids.length ){
			var count=0;
			(function callee( child ){
				for( var i=0; i<child.length; i++ ){
					if( ids.length && child[i].child ){
						callee( child[i].child );
					}
					for( var j=0; j<ids.length; j++ ){
						if( tree.movable(ids[j]) ){
							// 消していいノードID
							if( child[i].id==ids[j] ){
								// 見つけた消去
								child.splice(i,1); i--;
								ids.splice(j,1);
								count++;
								break;
							}
						}else{
							// 消しちゃダメノードID
							ids.splice(j--,1);
						}
					}
				}
			})( tree.root.child );
			if( count ){
				tree.modified(true);
				return true;
			}
		}
		return false;
	}
	// ノード移動(childに)
	// ids:ノードID配列、dst:フォルダノードIDまたはノードオブジェクト、push:trueで末尾追加
	,moveChild:function( ids, dst ,push ){
		if( oStr.call(dst)==='[object String]' ) dst = tree.node( dst );
		if( dst && dst.child ){
			// 移動元ノード検査：移動元と移動先が同じ、移動不可ノード、移動元の子孫に移動先が存在したら除外
			for( var i=ids.length; i--; ){
				if( ids[i]==dst.id || !tree.movable(ids[i]) || tree.nodeAhasB(ids[i],dst) )
					ids.splice(i,1);
			}
			if( ids.length ){
				// 切り取り
				var clipboard = [];
				(function callee( child ){
					for( var i=0; i<child.length; i++ ){
						if( !ids.length ) break;
						if( child[i].child ) callee( child[i].child );
						for( var j=0; j<ids.length; j++ ){
							if( child[i].id==ids[j] ){
								// 見つけた
								clipboard.push( child.slice(i,i+1)[0] );
								child.splice(i,1); i--;
								ids.splice(j,1);
								break;
							}
						}
					}
				})( tree.root.child );
				// 貼り付け
				if( clipboard.length ){
					if( push ){
						// 末尾に
						for( var i=0; i<clipboard.length; i++ ) dst.child.push( clipboard[i] );
					}
					else{
						// 先頭に
						for( var i=clipboard.length; i--; ) dst.child.unshift( clipboard[i] );
					}
					tree.modified(true);
				}
			}
		}
	}
	// ノード移動(前後に):既定は前に移動、第三引数がtrueなら後に移動
	// ids:ノードID配列、dstid:ノードID、isAfter:boolean
	,moveSibling:function( ids, dstid, isAfter ){
		// 移動元ノード検査：移動元と移動先が同じ、移動不可ノード、移動元の子孫に移動先が存在したら除外
		for( var i=ids.length; i--; ){
			if( ids[i]==dstid || !tree.movable(ids[i]) || tree.nodeAhasB(ids[i],dstid) )
				ids.splice(i,1);
		}
		if( ids.length ){
			// 移動先の親ノード
			var dstParent = tree.nodeParent( dstid );
			if( dstParent ){
				// 移動元ノード抜き出し
				var movenodes = [];
				(function callee( child ){
					for( var i=0; i<child.length; i++ ){
						if( ids.length && child[i].child ){
							callee( child[i].child );
						}
						for( var j=0; j<ids.length; j++ ){
							if( child[i].id==ids[j] ){
								// 見つけた:コピーしてから削除
								movenodes.push( child.slice(i,i+1)[0] );
								child.splice(i,1); i--;
								ids.splice(j,1);
								break;
							}
						}
					}
				})( tree.root.child );
				if( movenodes.length ){
					// 移動先のchildインデックス
					for( var i=0; i<dstParent.child.length; i++ ){
						if( dstParent.child[i].id==dstid ){
							// 見つけた
							if( isAfter ){
								if( i==dstParent.child.length-1 ){
									// 末尾ノードの後に挿入＝末尾追加
									for( var j=0; j<movenodes.length; j++ )
										dstParent.child.push(movenodes[j]);
								}else{
									// (末尾ノード以外の)後に挿入＝次ノードの前に挿入(逆順に１つずつ)
									i++;
									for( var j=movenodes.length; j--; )
										dstParent.child.splice(i,0, movenodes[j]);
								}
							}else{
								// 前に挿入(逆順に１つずつ)
								for( var j=movenodes.length; j--; )
									dstParent.child.splice(i,0, movenodes[j]);
							}
							break;
						}
					}
					tree.modified(true);
				}
			}
		}
	}
};
// index.json読取のみ最小限
var option = {
	data:{
		font:{ css:'' }
	}
	,font:{
		css:function(){
			var font = option.data.font;
			// 一度目の参照時に規定値を設定
			if( font.css==='' ) font.css = 'gothic.css';
			return font.css;
		}
	}
	,init:function( data ){
		var od = option.data;
		if( 'font' in data ){
			if( 'css' in data.font ) od.font.css = data.font.css;
		}
		return option;
	}
	,load:function( onComplete ){
		$.ajax({
			dataType:'json'
			,url	:'index.json'
			,success:function(data){ option.init( data ); }
			,complete:onComplete
		});
	}
};
// ブックマークデータ取得
(function(){
	var optionOK = false;
	var treeOK = false;
	option.load(function(){
		// 準備
		var fontSize = (option.font.css()==='gothic.css')? 13 : 12;
		$.css.add('#toolbar input, #folderbox span, #itemhead span, #itembox span, #dragbox, #editbox, #findopt, #tooltip, #batch{font-size:'+fontSize+'px;}');
		$('#fontcss').attr('href',option.font.css());
		resize.call( doc );	// 初期化のためwindowオブジェクトでない引数とりあえずdocument渡しておく
		$('body').css('visibility','visible');
		// ツリー描画
		optionOK = true;
		if( treeOK ) _folderTree();
		$('#home, #newfolder, #newitem, #selectall, #delete, #deadlink, #logout, #new100, #old100, #findopt label').tooltip();
	});
	tree.load(function(){
		treeOK = true;
		if( optionOK ) _folderTree();
	});
	$.ajax({
		url:':clipboard.txt'
		,error:function(xhr){ if( xhr.status==403 ) isLocalServer=false; }
	});
	function _folderTree(){
		// フォルダツリーやアイテム欄生成などで、反応速度が遅れない程度にDOM生成ビジーループの実行回数を
		// 制限してsetTimeoutループにしているが、遅いマシンならビジーループ回数を少なく、速いマシンなら
		// ビジーループ回数を多く、自律的に調節したい。この一発目のfolderTree()の実行時間を見て、以降の
		// ループ回数を決める。
		var time = (new Date()).getTime();
		var count = folderTree({ click0:true });
		time = (new Date()).getTime() - time;
		// きちんと測定する処理を走らせるのは時間かかるので行わず、今の自PCでChromeの時の実測結果から、
		// 適当に問題ないだろう範囲でループ回数を増減させる程度にしておく。
		// count は実際に生成フォルダの数で、フォルダ数が多ければ busyLoopCount と同じだが、フォルダ数が
		// 少ない新規インストール時などはcount=4になる。実測しただいたいの平均time(ms)は以下。
		//   count=  4, time= 70ms
		//   count= 10, time= 80ms
		//   count= 20, time=120ms
		//   count= 50, time=250ms
		//   count=100, time=400ms
		// folderTree()一発目ではsetTimeoutループ以外の処理も含まれておりその時間をX、1フォルダ生成の
		// 時間をYとすると、次の式になる。
		//   ① X + Y * 4 = 70
		//   ② X + Y * 10 = 80
		//   ③ X + Y * 20 = 120
		//   ④ X + Y * 50 = 250
		//   ⑤ X + Y * 100 = 400
		// 自PCではなんとなく busyLoopCount=20 くらいでいいかなと思っていたので、③を基準でいいかな？
		// X = 50, Y=3.5 くらい。この値と、取得した time/count を使って busyLoopCount を調節する。
		// たとえば count=10, time=30 を取得したとすると、自PCでcount=10は、
		//   50 + 3.5 * 10 = 85
		// time=85msになる。取得したtime=30msは自PCより速いためループ回数を基準の20よりも増やす。
		// どれくらい増やすかは割合で、
		//   20 * 85 / 30 = 56.666…
		// busyLoopCountは 56 か 57 あたりに。
		if( IE && IE<8 ){
			// IE8はhttp/https混在サイトでダイアログ「セキュリティで保護されたWebページコンテンツのみ
			// 表示しますか？」が出て、OKをクリックするまでの時間もtimeに含まれてちゃんと測定できない
			// ので規定値のまま。
		}
		else{
			busyLoopCount = Math.round( 20 * (50 + 3.5 * count) / time );
			if( busyLoopCount <10 ) busyLoopCount = 10;
			else if( busyLoopCount >100 ) busyLoopCount = 100;
		}
	}
})();
// CSSルール追加
// http://d.hatena.ne.jp/ofk/20090716/1247719727 +$.browserを使わない +IE7fix
$.css.add = function( rule ,index ){
	var sheet = $.css.sheet;
	if( !sheet ){
		if('createStyleSheet' in doc) sheet = doc.createStyleSheet();
		else{
			sheet = doc.createElement('style');
			sheet.appendChild( doc.createTextNode('') );
			doc.documentElement.appendChild( sheet );
			sheet = sheet.sheet;
		}
		$.css.sheet = sheet;
	}
	if('insertRule' in sheet) return sheet.insertRule( rule ,index || sheet.cssRules.length );

	var idx = rule.indexOf('{');
	rule = rule.replace(/[\{\}]/g,'');
	var rgx = /^\s+|\s+$/g;
	var selector = rule.slice(0,idx).replace(rgx,'');
	var style = rule.slice(idx).replace(rgx,'');
	var indexAdded = -1;
	if( idx !==-1 ){
		if( IE && IE<8 ){
			indexAdded = index || sheet.rules.length;
			var sels = selector.split(',');
			for( var i=0; i<sels.length; i++ ) sheet.addRule( sels[i] ,style ,indexAdded++ );
			indexAdded--;
		}
		else sheet.addRule( selector ,style ,indexAdded = index || sheet.rules.length );
	}
	return indexAdded;
};
// フォルダツリー生成
// folderTree({
//   click0		:bool		最初のフォルダをクリックするかどうか
//   clickID	:string		クリックするフォルダノードID文字列
//   itemOption	:object		フォルダクリック後に実行されるitemList()の第2引数
//   done		:function	フォルダツリー生成後に実行する関数
// });
// TODO:最初はごみ箱はプラスボタンで中のフォルダ見えなくていいかも
// TODO:IE8でごみ箱のフォルダを削除や移動するとアイテム欄が更新されるのが遅く表示もたつく
var folderTree = function(){
	var timer = null;	// setTimeoutID
	var $folder = null;	// フォルダ１つ生成関数
	return function( opt ){
		// 古いのキャンセル
		clearTimeout( timer );
		if( $folder ) $folder(false);
		// setTimeoutで１フォルダずつDOM生成するためまずフォルダ情報配列をつくり、
		var folderList = [];
		function hasFolder( child ){
			for( var i=child.length; i--; ) if( child[i].child ) return true;
			return false;
		}
		(function toplist( node, depth ){
			folderList.push({
				id		:node.id
				,title	:node.title
				,icon	:'folder.png'
				,depth	:depth
				,sub	:hasFolder( node.child )
			});
			for( var i=0, n=node.child.length; i<n; i++ ){
				if( node.child[i].child )
					toplist( node.child[i], depth +1 );
			}
		})( tree.top(), 0 );
		folderList.push({
			id		:tree.trash().id
			,title	:tree.trash().title
			,icon	:'trash.png'
			,depth	:0
			,sub	:hasFolder( tree.trash().child )
		});
		(function trashlist( child, depth ){
			for( var i=0, n=child.length; i<n; i++ ){
				if( child[i].child ){
					folderList.push({
						id		:child[i].id
						,title	:child[i].title
						,icon	:'folder.png'
						,depth	:depth
						,sub	:hasFolder( child[i].child )
					});
					trashlist( child[i].child, depth +1 );
				}
			}
		})( tree.trash().child, 1 );
		// 次に配列をつかって順次DOM生成
		var $folders = $('#folders');
		$folder = function(){
			var $sub = $('<img class=sub src=minus.png>');
			var $icon = $('<img class=icon>');
			var $title = $('<span class=title></span>');
			var $e = $('<div class=folder tabindex=0></div>')
				.append($icon).append($title).append('<br class=clear>')
				.on('mouseleave',itemMouseLeave);
			// 現在のサブツリー開閉状態を取得
			var subs = $folders.find('.sub'); //$folders[0].querySelectorAll('.sub');
			var isClose = {};
			for( var i=subs.length; i--; ){
				isClose[subs[i].parentNode.id.slice(6)] = /plus.png$/.test(subs[i].src);
			}
			return function( node ){
				if( node===false ){ $e.remove(); $sub.remove(); return; }
				$icon.attr('src',node.icon);
				$title.text( node.title );
				var $f = $e.clone(true).attr('id','folder'+node.id);
				if( node.sub ){
					var $s = $sub.clone();
					if( isClose[node.id] ) $s.attr('src','plus.png');
					$f.prepend( $s ).css('padding-left', node.depth *18 ); // 階層インデント18px
				}
				else $f.css('padding-left', node.depth *18 +15 );	// 階層インデント18px +<img class=sub>の幅15px
				return $f;
			};
		}();
		var index = 0;
		var length = folderList.length;
		var maxWidth = 0;
		var hide = false;	// サブツリー非表示フラグ
		var hideDepth = 0;	// サブツリー非表示階層
		var box = doc.getElementById('folderbox');
		var element = null;
		var scrollLeft = box.scrollLeft;
		var scrollTop = box.scrollTop;
		var lister = function(){
			var count = busyLoopCount;
			while( index < length && count>0 ){
				// DOM生成
				var node = folderList[index];
				var $node = $folder( node ).appendTo( $folders );
				// #folders幅設定(しないと横スクロールバーが必要な時に幅が狭くなり表示崩れる)
				var $title = $node.children('.title');
				var width = (1.6 * $title.width() + $title[0].offsetLeft)|0;
				if( width > maxWidth ){
					$folders.width( width );
					maxWidth = width;
				}
				// サブツリー開閉判定
				if( node.sub ){
					if( /plus.png$/.test($node.find('.sub')[0].src) ){
						if( !hide || hideDepth > node.depth ) hide = true, hideDepth = node.depth;
					}
					else{
						if( hide && hideDepth >= node.depth ) hide = false;
					}
				}
				if( hide && hideDepth < node.depth ) $node.hide();
				// 次
				index++; count--;
			}
			// フォルダ生成ループ1回終了
			if( !element ){
				if( opt.clickID ){
					// 指定フォルダクリック
					element = doc.getElementById('folder'+ opt.clickID );
					if( element ) $(element).trigger('click',opt.itemOption);
				}
				else if( opt.selectID ){
					// 指定フォルダ選択
					element = doc.getElementById('folder'+ opt.selectID );
					if( element ){
						var $node = $(element).addClass('select');
						selectFolder = $node[0];
						if( opt.inactive ) $node.addClass('inactive');
						else select = selectFolder;
					}
				}
			}
			if( index < length ) timer = setTimeout(lister,0);
			else{
				$folder(false);
				box.scrollLeft = scrollLeft;
				box.scrollTop = scrollTop;
				if( opt.done ) opt.done();
			}
			return index;
		};
		$folders.empty();
		var count = lister();
		// 先頭フォルダクリック
		if( opt.click0 ) $('#folder'+ folderList[0].id ).click();
		return count;
	};
}();
// アイテム欄作成
// itemList('?')							アイテム欄の種類を返却('child'|'deads'|'finds')
// itemList('deadsRunning?')				フォルダリンク切れ調査実行中かどうか
// itemList(false)							処理中止
// itemList( node ,option )					フォルダnodeのchildをアイテム欄に表示。
// itemList('disappear',folderNode )		アイテム欄内フォルダ展開やめ
// itemList('appear',folderNode )			アイテム欄内フォルダ展開
// itemList('appear',folderNode ,option )	アイテム欄内フォルダ展開(アイテム欄スクロール)
// itemList('finds')						検索実行
// itemList('poke')							リンク切れ調査(アイテム欄の選択ブックマークURLのみ)
// itemList('deads','folder')				リンク切れ調査(アイテム欄の選択ブックマークとフォルダ内)
// itemList('deads', node )					リンク切れ調査(フォルダnode内ぜんぶ)
var itemList = function(){
	var $head = $('#itemhead');
	var $head3 = $head.children('.misc');	// 可変項目ヘッダ(アイコン/場所/調査結果)
	var $itemAdds = [];						// アイテム１つ生成関数とタイマー{func,timer}の配列
	var kind = 'child';						// アイテム欄の種類
	var timer = null;						// setTimeoutID
	var ajaxCreate = null;					// ajax発行関数
	var rooms = [];							// ajax管理配列
	var roomMax = 5;						// ajax管理配列数(クライアント側並列ajax数)上限
	var queue = [];							// ajax待ちノード配列キュー
	var parallel = 2;						// 調節並列数(クライアント側ajax数×サーバー側並列数)
	var capacity = 50;						// 全体並列数上限(約)
	var results = {};						// 死活結果プール(キー=URL,値=poke応答)
	var appearIDs = {};						// アイテム欄内フォルダ開ノードID保持
	$('#finding').offset($('#keyword').offset()).progressbar();
	// 中断終了処理
	function finalize( arg0 ,arg1 ){
		// タイマー中止
		clearTimeout(timer) ,timer=null;
		// ajax中止:アイテムリンク切れ調査は止めず・フォルダリンク切れ調査は止める
		if( !(arg0==='poke' && ajaxCreate && ajaxCreate('?')==='poke') ){
			if( kind==='deads' || arg0==='deads' ){
				if( ajaxCreate ) ajaxCreate(false) ,ajaxCreate=null;
				if( rooms.length ){
					for( var i=rooms.length; i--; ) if( rooms[i].$ajax ) rooms[i].$ajax.abort();
					rooms = [];
				}
				queue.length = 0;
			}
		}
		// 検索終了
		$('#itembox').children('.spacer').empty();
		$('#finding').progressbar('value',0);
		$('#findstop').hide();
		$('#find').show();
		// アイテム生成中断
		if( kind==='child' ){
			// アイテム欄内でフォルダ開く時は継続中の展開処理は止めない(並列実行)
			if( arg0==='appear' ) return;
			// アイテム欄内でフォルダ閉じる時
			if( arg0==='disappear' ){
				var node = tree.node( arg1.id.slice(4) );
				// 実行中のアイテム生成処理を調べて
				for( var i=$itemAdds.length; i--; ){
					var folderNode = $itemAdds[i].func('?');
					if( folderNode ){
						// このフォルダと配下フォルダの展開タイマーだけ止める
						if( folderNode===arg1 || tree.nodeAhasB( node ,folderNode.id.slice(4) ) ){
							clearTimeout( $itemAdds[i].timer );
							$itemAdds[i].func(false); // 解放
							$itemAdds.splice(i,1);
						}
					}
				}
				return;
			}
		}
		for( var i=$itemAdds.length; i--; ){
			clearTimeout( $itemAdds[i].timer );
			$itemAdds[i].func(false); // 解放
		}
		$itemAdds.length = 0;
	}
	// リンク切れ調査URL並列数の調節(低速環境は並列数を少なく)
	// ・並列数は少なめから開始
	// ・すべて正常/注意/死亡だった(＝通信が行われた)時のかかった時間を記録する
	// ・かかった時間の平均値が、2秒以内になるよう並列数を増減させる
	// ・2秒という値はサーバ側の内部タイムアウト値4秒(固定)からなんとなく
	// ・ただし受信タイムアウトが発生した場合はすぐさま並列数を半減させる
	// ・NEGiESで帯域制限かけて並列数が増減することを確認する
	function ajaxStart(){
		if( !ajaxCreate ) return;
		// 現在の並列数
		var people = 0;
		for( var i=rooms.length; i--; ){
			people += rooms[i].nodes.length;
			//console.log('room['+ i +']='+ rooms[i].nodes.length);
		}
		//console.log('現在の並列数'+ people);
		var vacancy = roomMax - rooms.length;
		// 現在の並列数が上限未満で空きがあれば新規ajax発行
		if( people < parallel && vacancy ){
			var quotie = Math.floor( parallel / roomMax );
			var remain = parallel % roomMax;
			for( var i=vacancy; i--; ){
				var count = quotie;
				if( remain ) count++ ,remain--;
				ajaxCreate( count );
			}
		}
	}
	function paraAdjust( st ){
		var times = 0;			// 正常通信の数
		var timeAve = 0;		// 正常通信の平均時間
		var timeouts = 0;		// タイムアウト発生回数
		for( var i=st.length; i--; ){
			switch( st[i].kind ){
			case 'O': case 'D': case '!':   // 正常・死亡・注意(通信正常)
				times++;
				timeAve += st[i].time;
				break;
			case '?':
				if( st[i].msg.indexOf('受信タイムアウト')>=0 ){	// 受信タイムアウト(並列過多かも)
					timeouts++;
					break;
				}
			default: return; // 調節しない
			}
		}
		if( times ) timeAve = timeAve / times;
		if( timeouts && parallel >1 ){
			//console.log('並列数'+ parallel +'でタイムアウト'+ timeouts +'回発生');
			//console.log('正常通信数'+ times +', 正常通信の平均時間'+ timeAve);
			if( !times || timeAve >1000 ){
				var para = Math.floor( parallel /2 );
				//console.log('並列数を半減'+ parallel +' -> '+ para);
				parallel = para;
				return;
			}
			//else console.log('正常通信の時間は短いため並列数は維持');
		}
		if( times ){
			//console.log('正常通信の平均時間'+ timeAve);
			var para = Math.floor( parallel * (1000.0 / timeAve) );	// 1秒で完了する数に近づける
			if( para <1 ) para=1; else if( para >capacity ) para = capacity;
			if( para != parallel ){
				//console.log('並列数を変更'+ parallel +' -> '+ para);
				parallel = para;
			}
		}
	}
	// リンク切れ調査結果アイコン画像
	function stIcoSrc( st ){
		switch( st.kind ){
		case 'O': return 'ok.png';		// 正常
		case 'E': return 'delete.png';	// エラー
		case 'D': return 'skull.png';	// 死亡
		case '!': return 'warn20.png';	// 注意
		}
		return 'ques20.png';			// 不明
	}
	// itemList本体
	return function( arg0 ,arg1 ,arg2 ){
		if( arg0==='?' ) return kind;
		if( arg0==='deadsRunning?' ) return (kind==='deads' && timer) ? true : false;
		finalize( arg0 ,arg1 );
		if( arg0===false ) return;
		if( arg0==='finds' ){
			// 検索
			if( arg1==='new100' || arg1==='old100' ){
				// 新旧100
				$('#'+arg1).addClass('disable');
			}
			else if( findopt.regex() ){
				// 正規表現
				var pattern = $('#keyword').val();
				if( pattern.length<=0 ) return;
				var flag = undefined;
				if( pattern[0]=='/' ){
					var last = pattern.lastIndexOf('/');
					if( last>0 ){
						flag = pattern.slice( last +1 );
						if( flag.length ) pattern = pattern.slice( 1 ,last );
						else flag = undefined;
					}
				}
				try{ var regex = new RegExp( pattern ,flag ); }
				catch(e){ Notify('不正な正規表現です'); return; }
				String.prototype.myFound = function(){ return regex.test(this)? true:false; };
			}
			else{
				// 通常
				var words = $('#keyword').val().split(/[ 　]+/);
				for( var i=words.length; i--; ){
					if( words[i].length<=0 ) words.splice(i,1);
					else words[i] = words[i].myNormal();
				}
				if( words.length<=0 ) return;
				String.prototype.myFound = function(){
					// AND検索(TODO:OR検索・大小文字区別対応する？)
					var str = this.myNormal();
					for( var i=words.length; i--; ){
						if( str.indexOf(words[i])<0 ) return false;
					}
					return true;
				};
			}
			kind = 'finds';
			$head3.text('場所 / 調査結果');
			$('#deadinfo').trigger('dying').remove();
			$('#itembox').children('.spacer').height( 48 ).html('<img src=wait.gif>'); // アイテム欄余白48px
			$('#find').hide();
			$('#findstop').show().off('click').click(function(){
				// 中止ボタン
				finalize();
				// 新旧100
				if( arg1==='new100' || arg1==='old100' ) $('#'+arg1).removeClass('disable');
			});
			var items = doc.getElementById('items');
			var $itemAdd = { timer:null };
			$itemAdds.push( $itemAdd );
			$itemAdd.func = function(){
				var $item = $('<div class=item tabindex=0></div>')
					.append('<img class=icon>')
					.append($('<span class=title></span>').width( $head.children('.title').width() -25 ))
					.append($('<span class=url></span>').width( $head.children('.url').width() -1 ))
					.append($('<span class=place></span>').width( $head3.width() -1 ))
					.append($('<span class=date></span>').width( $head.children('.date').width() -18 ))
					.append('<br class=clear>')
					.on('mouseleave',itemMouseLeave);
				var $stico = $('<img class=icon style="margin-left:0">');
				var date = new Date();
				var index = 0;
				return function( node, now, place ){
					if( node===false ){ $item.remove(); $stico.remove(); return; }
					if( node.child ){
						var $e = $item.clone(true).addClass('folder').attr('id','item'+node.id);
						$e.children('.icon').attr('src','folder.png');
						for( var smry='', i=node.child.length; i--; ) smry+='.';
						$e.children('.url').text( smry );
						$e.children('.place').text( place );
					}
					else{
						var $e = $item.clone(true).attr('id','item'+node.id);
						$e.children('.icon').attr('src', node.icon ||'item.png');
						$e.children('.url').text( node.url );
						var st = results[node.url];
						if( st ){
							$e.children('.place').removeClass('place').addClass('status')
							.text( st.msg +(st.url.length? ' ≫'+st.url :'') )
							.prepend( $stico.clone().attr('src',stIcoSrc(st)) );
						}
						else $e.children('.place').text( place );
					}
					date.setTime( node.dateAdded ||0 );
					$e.children('.date').text( myFmt(date,now) );
					$e.children('.title').text( node.title ).attr('title', node.title);
					if( index++ %2 ) $e.addClass('bgcolor');
					if( st && st.kind==='D' ) $e.addClass('dead');
					items.appendChild( $e[0] );
				};
			}();
			// フォルダ配列生成・ノード総数カウントして検索実行
			// ちょっともたつくのでsetTimeout実行して中止ボタンをすぐに表示する
			var folders = [{ node:tree.top(), place:'' }];	// フォルダ配列
			var nodeTotal = 0;								// URL＋フォルダ数
			timer = setTimeout(function(){
				var counter = function( child, place ){
					nodeTotal += child.length;
					for( var i=0, n=child.length; i<n; i++ ){
						if( child[i].child ){
							folders.push({ node:child[i], place:place });
							counter( child[i].child, place +' > ' +child[i].title );
							nodeTotal--;
						}
					}
				};
				(function( child ){
					nodeTotal += child.length;
					for( var i=0, n=child.length; i<n; i++ ){
						if( child[i].child ){
							folders.push({ node:child[i], place:'' });
							counter( child[i].child, child[i].title );
							nodeTotal--;
						}
					}
				})( tree.top().child );
				folders.push({ node:tree.trash(), place:'' });
				counter( tree.trash().child, tree.trash().title );
				nodeTotal += folders.length;
				// 検索実行もいちおうsetTimeout
				timer = setTimeout(findexe,0);
			},0);
			// 検索実行
			var findexe = function(){
				items.innerHTML = '';
				var $finding = $('#finding');
				var now = (new Date()).getTime();
				var index = 0;
				var total = 0;
				var finder = function(){
					var limit = total +21; // 20ノード以上ずつ
					while( index < folders.length && total<limit ){
						var folder = folders[index];
						// フォルダ名
						if( folder.node.title.myFound() ){
							$itemAdd.func( folder.node, now, folder.place );
						}
						total++;
						// ブックマークタイトルとURL
						var child = folder.node.child;
						var place = (folder.place.length? folder.place +' > ' :'') +folder.node.title;
						for( var i=0, n=child.length; i<n; i++ ){
							if( child[i].child ) continue;
							if( (child[i].title +child[i].url).myFound() ){
								$itemAdd.func( child[i], now, place );
							}
							total++;
						}
						index++;
					}
					// 進捗バー
					$finding.progressbar('value',total*100/nodeTotal);
					// 次
					if( index < folders.length ) timer = setTimeout(finder,0);
					else finish();
				};
				// 新旧100
				// TODO:ビジーループ型なので進捗バー処理なし(setTimeout型にするのが面倒)
				var sortUrlTop = function( max ,fromRecent ){
					var urls = [];
					for( var i=folders.length; i--; ){
						var folder = folders[i];
						var place = (folder.place.length? folder.place +' > ' :'') +folder.node.title;
						var child = folder.node.child;
						for( var j=child.length; j--; ){
							if( child[j].child ) continue;
							var date = child[j].dateAdded ||0;
							for( var k=urls.length; k--; ){
								if( fromRecent ){
									if( (urls[k].node.dateAdded||0) >=date ) break;
								}
								else{
									if( (urls[k].node.dateAdded||0) <=date ) break;
								}
							}
							if( ++k < max ){
								urls.splice( k ,0 ,{ node:child[j] ,place:place });
								if( urls.length >= max ) urls.length = max;
							}
						}
					}
					for( var i=0 ,n=urls.length; i<n; i++ ){
						$itemAdd.func( urls[i].node, now, urls[i].place );
					}
					$('#'+arg1).removeClass('disable');
					finish();
				};
				// 検索終了
				var finish = function(){
					if( items.children.length<=0 ) $('#itembox').children('.spacer').text('見つかりません');
					finalize();
				};
				if( arg1==='new100' ) return sortUrlTop( 100 ,true );
				if( arg1==='old100' ) return sortUrlTop( 100 );
				finder();
			};
		}
		else if( arg0==='poke' ){
			// アイテム欄の選択ブックマークをリンク切れ調査(フォルダ/javascriptは無視)
			// ★アイテムリンク切れ調査は、別フォルダを表示したり調査中に次のアイテム調査を実行しても
			// キューに入ったものは(画面上はわからないが)調査が継続する。(フォルダ調査との違いに注意)
			// ただしフォルダリンク切れ調査が開始された場合、アイテム調査は中断(キューに残った未調査
			// ぶんは破棄)される。
			// ノード配列作成
			var items = doc.getElementById('items').children;
			for( var i=0, n=items.length; i<n; i++ ){
				var $item = $(items[i]);
				if( $item.hasClass('item') && $item.hasClass('select') && !$item.hasClass('folder') ){
					var $url = $item.children('.url');
					var url = $url.text();
					if( url.length <=0 ) continue;
					if( /^javascript:/i.test(url) ) continue;
					$url.next().removeClass('iconurl').removeClass('place').addClass('status').text('調査中...');
					$url.parent().removeClass('dead');
					queue.push( items[i].id.slice(4) );
				}
			}
			// ajax発行
			if( !ajaxCreate ){
				var $stico = $('<img class=icon style="margin-left:0">');
				parallel = 2;
				ajaxCreate = function( nodeCount ){
					if( nodeCount==='?' ) return 'poke';
					if( nodeCount===false ){ $stico.remove(); return; }
					var entry = { nodes:[] } ,reqBody = '';
					for( var i=nodeCount; i-- && queue.length; ){
						var node = tree.node( queue.shift() );
						if( node ){
							entry.nodes.push( node );
							reqBody += ':'+ node.url +'\r\n';
						}
					}
					if( reqBody ){
						//console.log('ajax発行、URL='+ entry.nodes.length);
						entry.$ajax = $.ajax({
							type:'post'
							,url:':poke'
							,data:reqBody
							,error:function(xhr){
								if( !ajaxCreate ) return;
								for( var i=0; i<entry.nodes.length; i++ ){
									var $st = $('#item'+entry.nodes[i].id).children('.url').next();
									if( !$st.hasClass('status') ){
										$st.removeClass('iconurl').removeClass('place').addClass('status');
									}
									$st.text( xhr.status+' '+xhr.statusText )
									.prepend( $stico.clone().attr('src','delete.png') );
								}
							}
							,success:function(data){
								if( !ajaxCreate ) return;
								// data.length==entry.nodes.length のはず…
								for( var i=0; i<entry.nodes.length; i++ ){
									var node = entry.nodes[i];
									var st = data[i];
									var $st = $('#item'+node.id).children('.url').next();
									if( node.url ) results[node.url] = st;
									if( !$st.hasClass('status') ){
										$st.removeClass('iconurl').removeClass('place').addClass('status');
									}
									$st.text( st.msg +(st.url.length? ' ≫'+st.url :'') )
									.prepend( $stico.clone().attr('src',stIcoSrc(st)) );
									if( st.kind==='D' ) $st.parent().addClass('dead');
								}
								paraAdjust( data );
							}
							,complete:function(){
								// エントリ削除
								var index = $.inArray( entry ,rooms );
								if( index >=0 ) rooms.splice(index,1);
								// 次
								ajaxStart();
							}
						});
						rooms.push( entry );
					}
				};
			}
			ajaxStart();
		}
		else if( arg0==='deads' ){
			// リンク切れ調査(フォルダ)
			// ★フォルダリンク切れ調査は、前回実行中のリンク切れ調査(アイテム/フォルダ)を中断し、
			// 新規に調査を実行する。実行中に別フォルダ表示などでアイテム欄を変更した場合、調査は
			// 中断される。(アイテム調査との違いに注意)
			// TODO:フォルダ表示や検索で調査が中断される時は確認ダイアログ？
			kind = 'deads';
			$head3.text('調査結果');
			$('#deadinfo').trigger('dying').remove();
			var $ok = $('<span class=count>0</span>');
			var $err = $ok.clone();
			var $dead = $ok.clone();
			var $warn = $ok.clone();
			var $total = $ok.clone();
			var $unknown = $ok.clone();
			var $totalbox = $('<span><img class=icon src=wait.gif>総数</span>').append( $total );
			var $okbox = $('<span><img class=icon src=ok.png>正常</span>').append( $ok );
			var $errbox = $('<span><img class=icon src=delete.png>エラー</span>').append( $err );
			var $deadbox = $('<span><img class=icon src=skull.png>リンク切れ</span>').append( $dead );
			var $warnbox = $('<span><img class=icon src=warn20.png>注意</span>').append( $warn );
			var $unknownbox = $('<span><img class=icon src=ques20.png>不明</span>').append( $unknown );
			var $folderName = $('<span></span>');
			var $info = $('<div id=deadinfo>リンク切れ調査 <img class=icon src=folder.png></div>')
				.on('dying',function(){ // 死に際
					$('#itembox').height( $('#folderbox').height() -$head.outerHeight() );
				})
				.prepend(
					$('<button><img class=icon src=stop.png>中止</button>').button().click(function(){
						$totalbox.find('img').attr('src','item.png');
						$(this).remove();
						finalize();
					})
				)
				.append( $folderName ).append('<br>')
				.append( $totalbox ).append( $okbox ).append( $warnbox )
				.append( $deadbox ).append( $errbox ).append( $unknownbox )
				.width( $head.width() )
				.css('left',$head.css('left') )
				.insertBefore( $head );
			$('#itembox').height( $('#folderbox').height() -$head.outerHeight() -$info.outerHeight() )
				.children('.spacer').height( 48 ).html('<img src=wait.gif>'); // アイテム欄余白48px
			// ノード配列作成
			var queuer = function( node ){
				if( node.url.length <=0 ) return;
				if( /^javascript:/i.test(node.url) ) return;
				queue.push( node );
			};
			var childer = function( child ){
				for( var i=0; i<child.length; i++ ){
					if( child[i].child ) childer( child[i].child );
					else queuer( child[i] );
				}
			};
			var items = doc.getElementById('items');
			if( arg1==='folder' ){
				// アイテム欄の選択ブックマークとフォルダ内を調査
				$folderName.text('(選択フォルダ)');
				var titles='';
				for( var i=0, n=items.children.length; i<n; i++ ){
					var item = items.children[i];
					if( $(item).hasClass('select') ){
						var node = tree.node( item.id.slice(4) );
						if( node ){
							if( node.child ){
								if( !titles ) titles=node.title; else titles+=', '+node.title;
								childer( node.child );
							}
							else queuer( node );
						}
					}
				}
				$folderName.text( titles );
			}
			else if( arg1 ){
				// 指定フォルダ1つ調査
				$folderName.text( (arg1===tree.root)?'全フォルダ':arg1.title );
				childer( arg1.child );
			}
			// ajax発行
			var $itemAdd = { timer:null };
			$itemAdds.push( $itemAdd );
			$itemAdd.func = function(){
				var $item = $('<div class=item tabindex=0></div>').on('mouseleave',itemMouseLeave);
				var $icon = $('<img class=icon>');
				var $title = $('<span class=title></span>');
				var $url = $('<span class=url></span>');
				var $stat = $('<span class=status></span>');
				var $img = $('<img class=icon style="margin-left:0">');
				var $date = $('<span class=date></span>');
				var $br = $('<br class=clear>');
				var $hTitle = $head.children('.title');
				var $hUrl = $head.children('.url');
				var $hDate = $head.children('.date');
				var date = new Date();
				var now = (new Date()).getTime();
				var index = 0;
				$item.append($icon).append($title).append($url).append($stat).append($date).append($br);
				return function( node ,ico ,txt ,cls ){
					if( node===false ){ $img.remove(); $item.remove(); return; }
					date.setTime( node.dateAdded ||0 );
					$icon.attr('src', node.icon ||'item.png');
					$title.text( node.title ).attr('title', node.title).width( $hTitle.width() -25 );
					$url.text( node.url ).width( $hUrl.width() -1 );
					$stat.text( txt ).prepend( $img.attr('src',ico) ).width( $head3.width() -1 );
					$date.text( myFmt(date,now) ).width( $hDate.width() -18 );
					var $e = $item.clone(true).attr('id','item'+node.id).addClass( cls );
					if( index++ %2 ) $e.addClass('bgcolor');
					items.appendChild( $e[0] );
				};
			}();
			var count = { total:0 ,ok:0 ,err:0 ,dead:0 ,warn:0 ,unknown:0 };
			var	qix = 0;
			parallel = 2;
			ajaxCreate = function( nodeCount ){
				if( nodeCount==='?' ) return 'deads';
				if( nodeCount===false ) return;
				var entry = { nodes:[] } ,reqBody = '';
				for( var i=nodeCount; i-- && qix < queue.length; ){
					var node = queue[qix++];
					entry.nodes.push( node );
					reqBody += ':'+node.url+'\r\n';
				}
				if( reqBody ){
					//console.log('ajax発行、URL='+ entry.nodes.length);
					entry.$ajax = $.ajax({
						type:'post'
						,url:':poke'
						,data:reqBody
						,error:function(xhr){
							if( !ajaxCreate ) return;
							for( var i=0; i<entry.nodes.length; i++ ){
								count.err++;
								$itemAdd.func( entry.nodes[i] ,'delete.png' ,xhr.status+' '+xhr.statusText );
							}
						}
						,success:function(data){
							if( !ajaxCreate ) return;
							// data.length==entry.nodes.length のはず…
							for( var i=0; i<entry.nodes.length; i++ ){
								var node = entry.nodes[i];
								var st = data[i];
								if( node.url ) results[node.url] = st;
								var cls = '';
								switch( st.kind ){
								case 'O': count.ok++; continue;				// 正常
								case 'E': count.err++; break;				// エラー
								case 'D': count.dead++; cls='dead'; break;	// 死亡
								case '!': count.warn++; break;				// 注意
								default: count.unknown++;					// 不明
								}
								$itemAdd.func( node ,stIcoSrc(st) ,st.msg +(st.url.length?' ≫'+st.url:'') ,cls );
							}
							paraAdjust( data );
						}
						,complete:function(){
							count.total += entry.nodes.length;
							// エントリ削除
							var index = $.inArray( entry ,rooms );
							if( index >=0 ) rooms.splice(index,1);
							// 次
							ajaxStart();
						}
					});
					rooms.push(entry);
				}
			};
			ajaxStart();
			items.innerHTML = '';
			// 完了待ち進捗表示ループ
			var waiter = function(){
				$ok.text( count.ok );
				$err.text( count.err );
				$dead.text( count.dead );
				$warn.text( count.warn );
				$unknown.text( count.unknown );
				if( count.total < queue.length ){
					$total.text( count.total +' / '+ queue.length );
					timer = setTimeout(waiter,500);
					return;
				}
				// 完了
				$totalbox.find('img').attr('src','item.png');
				$total.text( queue.length );
				if( count.ok==0 ) $okbox.remove();
				if( count.err==0 ) $errbox.remove();
				if( count.dead==0 ) $deadbox.remove();
				if( count.warn==0 ) $warnbox.remove();
				if( count.unknown==0 ) $unknownbox.remove();
				$info.find('button').remove();
				finalize();
			};
			waiter();
		}
		else if( arg0=='disappear' ){
			// アイテム欄内フォルダ展開やめ
			var $item = $(arg1);
			var indent = parseInt($item.children('.title').css('text-indent')||0);
			$item = $item.next();
			while( $item.hasClass('item') ){
				if( indent < parseInt($item.children('.title').css('text-indent')||0) ){
					var $next = $item.next();
					$item.remove();
					$item = $next;
				}
				else break;
			}
			delete appearIDs[arg1.id.slice(4)];
		}
		else{
			// フォルダ表示
			kind = 'child';
			$head3.text('アイコン / 調査結果');
			$('#deadinfo').trigger('dying').remove();
			var itembox = doc.getElementById('itembox');
			var items = doc.getElementById('items');
			var $itemAdd = { timer:null };
			$itemAdds.push( $itemAdd );
			$itemAdd.func = function(){
				var urlWidth = $head.children('.url').width() -1;
				var iurlWidth = $head3.width() -1;
				var $item = $('<div class=item tabindex=0></div>').on('mouseleave',itemMouseLeave);
				var $icon = $('<img class=icon style="position:relative;">');
				var $title = $('<span class=title></span>').width( $head.children('.title').width() -38 );
				var $url = $('<span class=url></span>').width( urlWidth );
				var $date = $('<span class=date></span>').width( $head.children('.date').width() -18 );
				var $br = $('<br class=clear>');
				var indent = 0;		// アイテム欄内フォルダ展開インデント(px)
				var bgcolor = 0;	// 背景色用カウンタ
				if( arg0==='appear'){
					var $arg1 = $(arg1);
					indent = parseInt( $arg1.children('.title').css('text-indent')||0 ) +18; // インデント+18px
					if( !$arg1.hasClass('bgcolor') ) bgcolor++; // 背景色交互になるように
				}
				var $folder = $item.clone(true)
					.addClass('folder')
					.append('<img class=appear style="position:relative;">')
					.append( $icon.clone().attr('src','folder.png') )
					.append( $title.clone() )
					.append( $('<span class=summary></span>').width( urlWidth +iurlWidth +6 ) )
					.append( $date.clone() )
					.append( $br.clone() );
				$item.append( $icon.css('margin-left',16) )
					.append( $title )
					.append( $url )
					.append( $('<span class=iconurl></span>').width( iurlWidth ) )
					.append( $date )
					.append( $br );
				var $stico = $('<img class=icon style="margin-left:0">');
				var date = new Date();
				var newitem = function( node, now ,appear ){
					if( node.child ){
						var $e = $folder.clone(true).attr('id','item'+node.id);
						for( var smry='', i=node.child.length; i--; ) smry+='.';
						$e.children('.summary').text( smry );
						$e.children('.appear').css('left',indent).attr('src',appear ? 'minus.png':'plus.png');
						$e.children('.icon').css('left',indent);
					}
					else{
						var $e = $item.clone(true).attr('id','item'+node.id);
						$e.children('.icon').attr('src', node.icon ||'item.png').css('left',indent);
						$e.children('.url').text( node.url );
						var st = results[node.url];
						if( st ){
							$e.children('.iconurl').removeClass('iconurl').addClass('status')
							.text( st.msg +(st.url.length? ' ≫'+st.url :'') )
							.prepend( $stico.clone().attr('src',stIcoSrc(st)) );
						}
						else $e.children('.iconurl').text( node.icon );
					}
					date.setTime( node.dateAdded ||0 );
					$e.children('.date').text( myFmt(date,now) );
					$e.children('.title').text( node.title ).attr('title',node.title).css('text-indent',indent);
					// TODO:アイテム欄内フォルダ展開で色が交互にならないパターンはまあいいかな…
					if( bgcolor++ %2 ) $e.addClass('bgcolor');
					if( st && st.kind==='D' ) $e.addClass('dead');
					return $e[0];
				};
				return(
					arg0==='appear' ?
					function( node ,now ,prevSibling ,appear ){
						// アイテム内フォルダ展開
						if( node==='?' ) return arg1;
						if( node===false ){ $folder.remove(); $item.remove(); $stico.remove(); return; }
						var item = newitem( node ,now ,appear );
						prevSibling.parentNode.insertBefore( item ,prevSibling.nextSibling );
						return item;
					}
					:function( node ,now ,appear ){
						// アイテム欄新規
						if( node==='?' ) return null;
						if( node===false ){ $folder.remove(); $item.remove(); $stico.remove(); return; }
						var item = newitem( node ,now ,appear );
						items.appendChild( item );
						return item;
					}
				);
			}();
			if( arg0==='appear' ){
				// アイテム欄内フォルダ展開
				var nid = arg1.id.slice(4);
				var pnode = tree.node( nid );
				if( pnode ){
					var prevSibling = arg1;
					var now = (new Date()).getTime();
					var appearNodes = [];
					var length = pnode.child.length;
					var index = 0;
					var lister = function(){
						var count = busyLoopCount;
						while( index < length && count>0 ){
							var node = pnode.child[index];
							if( appearIDs[node.id] ){
								prevSibling = $itemAdd.func( node ,now ,prevSibling ,true );
								appearNodes.push( prevSibling );
							}
							else prevSibling = $itemAdd.func( node ,now ,prevSibling );
							index++ ,count--;
						}
						// 次
						if( index < length ) $itemAdd.timer = setTimeout(lister,0);
						else{
							// 完了
							$itemAdd.func(false);
							for( var i=$itemAdds.length; i--; ){
								if( $itemAdds[i]===$itemAdd ) $itemAdds.splice(i,1);
							}
							for( var i=0; i<appearNodes.length; i++ ){
								itemList('appear',appearNodes[i] ,arg2 );
							}
							spacerHeight();
							if( arg2 ){
								if( arg2.scrollTop ) itembox.scrollTop = arg2.scrollTop;
								if( arg2.eachChild ) arg2.eachChild();
							}
						}
					};
					appearIDs[nid] = true;
					lister();
				}
			}
			else{
				// アイテム欄新規作成
				items.innerHTML = '';
				//selectItemClear();
				var now = (new Date()).getTime();
				var appearNodes = [];
				var length = arg0.child.length;
				var index = 0;
				var lister = function(){
					var count = busyLoopCount;
					while( index < length && count>0 ){
						var node = arg0.child[index];
						if( appearIDs[node.id] )
							appearNodes.push( $itemAdd.func( node ,now ,true ) );
						else
							$itemAdd.func( node ,now );
						index++ ,count--;
					}
					// 次
					if( index < length ) $itemAdd.timer = setTimeout(lister,0);
					else{
						// 完了
						$itemAdd.func(false);
						for( var i=$itemAdds.length; i--; ){
							if( $itemAdds[i]===$itemAdd ) $itemAdds.splice(i,1);
						}
						for( var i=0; i<appearNodes.length; i++ ){
							itemList('appear',appearNodes[i] ,arg1 );
						}
						spacerHeight();
						if( arg1 ){
							if( arg1.scrollTop ) itembox.scrollTop = arg1.scrollTop;
							if( arg1.eachChild ) arg1.eachChild();
						}
					}
				};
				lister();
			}
		}
	};
}();
// フォルダイベント
$('#folderbox')
.on('click','.folder',folderClick)
.on('dblclick','.folder',folderDblClick)
.on('selfclick','.folder',itemSelfClick)
.on('mousedown','.folder',folderMouseDown)
.on('mousedown','.sub',subTreeIcon)
.on('keydown','.folder',folderKeyDown)
.on('contextmenu','.folder',folderContextMenu);
// アイテムイベント
(function(){
	var data = { itemID:'', itemNotify:'' };
	$('#itembox')
	.on('mousedown','.item',data,itemMouseDown)
	.on('mousedown','.appear',appearIcon)
	.on('click','.item',data,itemClick)
	.on('dblclick','.item',itemDblClick)
	.on('selfclick','.item',itemSelfClick)
	.on('keydown','.item',itemKeyDown)
	.on('keypress','.item',itemKeyPress)
	.on('contextmenu','.item',itemContextMenu);
})();
// 画面リサイズ
$(win).on('resize',resize);
//
$(doc).on({
	mousedown:function(ev){
		for( var e=ev.target; e; e=e.parentNode ){
			// 右クリックメニュー消さず既定アクション停止
			if( e.id=='contextmenu' ) return false;
		}
		// 右クリックメニュー隠す
		$('#contextmenu').hide();
		if( onContextHide ) onContextHide();
		// inputタグはフォーカスするためtrue返す
		if( ev.target.tagName=='INPUT' ) return true;
		// 編集ボックス確定
		$('#editbox').blur();
		if( $(ev.target).hasClass('barbtn') ) return true;
		// (WK,GK)既定アクション停止
		return false;
	}
	// キーボードショートカット
	,keydown:function(ev){
		switch( ev.which || ev.keyCode || ev.charCode ){
		case 27: // Esc
			$('#home').click(); return false;
		case 46: // Delete
			if( ev.target.tagName !='INPUT' ){ $('#delete').click(); return false; }
		}
	}
	// テキスト選択キャンセル
	,selectstart:function(ev){
		switch( ev.target.tagName ){
		case 'INPUT': case 'TEXTAREA': return true;
		}
		return false;
	}
});
// IE8ウィンドウ外ドラッグでイベントが来ない問題のよい解決策がないので、
// ウィンドウ外に出たらドラッグやめたことにする。
if( IE && IE<9 ) $(doc).mouseleave(function(){ $(this).mouseup(); } );
// 変更保存リンク
$('#modified').click(function(){ treeSave(); });
// パネル画面に戻る
$('#home').click(function(){
	itemList(false);
	if( tree.modified() ) Confirm({
		width:420
		,msg:'?変更が保存されていません。いま保存して次に進みますか？　「いいえ」で変更を破棄して次に進みます。'
		,yes:function(){ treeSave({ success:home }); }
		,no:home
	});
	else home();
	function home(){ location.href = '/'; }
});
// ログアウト
if( /session=.+/.test(doc.cookie) ){
	$('#logout').click(function(){
		itemList(false);
		if( tree.modified() ) Confirm({
			width:450
			,msg:'?変更が保存されていません。いま保存してログアウトしますか？　「いいえ」で変更を破棄してログアウトします。'
			,yes:function(){ treeSave({ success:logout }); }
			,no:logout
		});
		else logout();
		function logout(){
			$.ajax({
				url		:':logout'
				,error	:function(xhr){ Alert('エラー:'+xhr.status+' '+xhr.statusText); }
				,success:function(data){
					// dataはセッションID:過去日付でクッキー削除
					doc.cookie = 'session='+data+'; expires=Thu, 01-Jan-1970 00:00:01 GMT';
					location.reload(true);
				}
			});
		}
	});
}
else $('#logout').hide();
// 新規フォルダ
$('#newfolder').click(function(){
	// 選択フォルダID=folderXXならノードID=XX
	var nid = selectFolder.id.slice(6);
	var name = $('#newname').val();
	var node = tree.newFolder( name, nid );
	// フォルダツリー生成
	var opt = {
		 clickID:nid
		,done   :function(){ $('#item'+ node.id ).trigger('selfclick'); }
	};
	if( !name.length ){
		opt.eachChild = function(){
			edit( $('#item'+ node.id ).children('.title')[0] ,{ select:true });
		};
	}
	var $item = [];
	folderTree({
		 clickID:nid
		// アイテム欄で新フォルダ選択
		,itemOption:{
			eachChild:function(){
				if( !$item.length ){
					$item = $('#item'+ node.id ).trigger('selfclick');
				}
				if( $item.length && !name.length ){
					// 名前変更・テキスト選択
					edit( $item.children('.title')[0] ,{ select:true });
				}
			}
		}
	});
	$('#newname').val('');
});
$('#newname').keypress(function(ev){
	switch( ev.which || ev.keyCode || ev.charCode ){
	case 13: $('#newfolder').click(); return false;
	}
});
// 新規ブックマークアイテム
$('#newitem').on({
	click:function(){
		var url = $('#newurl').val();
		// 選択フォルダID=folderXXならノードID=XX
		var node = tree.newURL( tree.node( selectFolder.id.slice(6) ), url );
		if( url.length ){
			tree.modifing(true);
			$.ajax({
				 type:'post'
				,url:':analyze'
				,data:url+'\r\n'
				,success:function(data){
					data = data[0];
					if( data.title.length ){
						data.title = HTMLdec( data.title );
						if( tree.nodeAttr( node.id,'title',data.title ) >1 )
							$('#item'+node.id).find('.title').text( data.title ).attr('title',data.title);
					}
					if( data.icon.length ){
						if( tree.nodeAttr( node.id,'icon',data.icon ) >1 ){
							$('#item'+node.id)
							.find('.icon').attr('src',data.icon).end()
							.find('.iconurl').text( data.icon );
						}
					}
				}
				,complete:function(){ tree.modifing(false); }
			});
		}
		// DOM再構築
		var $item = [];
		itemList( tree.node( selectFolder.id.slice(6) ) ,{
			eachChild:function(){
				// 新アイテム選択
				if( !$item.length ){
					$item = $('#item'+ node.id ).trigger('selfclick');
				}
				if( $item.length && !url.length ){
					// URL編集
					edit( $item.children('.url')[0] );
				}
			}
		});
		$('#newurl').val('');
	}
	,contextmenu:function(ev){
		if( isLocalServer ){
			var $menu = $('#contextmenu').width( 250 );
			var $box = $menu.children('div').empty();
			// クリップボードから登録
			$box.append($('<a><img src=newitem.png>クリップボードのURLを新規登録</a>').click(function(){
				$menu.hide();
				// 選択フォルダ先頭に登録
				var pnode = tree.node( selectFolder.id.slice(6) );
				clipboardTo( pnode ,0 ,function( nodes ){
					var eachChild = function(){
						// アイテム欄内でDOM作成ループがおわるたびに
						for( var i=nodes.length; i--; ){
							// 新アイテム要素発見したら選択状態にして配列から除外
							var item = doc.getElementById('item'+ nodes[i].id );
							if( item ){
								// 先頭アイテムだけCtrlキー押下クリック(遅い)、それ以外は速いaddClass
								if( i==0 ) $(item).trigger('selfclick',[false,true]);
								else $(item).addClass('select');
								nodes.splice(i,1);
							}
							else break;
						}
					};
					itemList( pnode ,{ scrollTop:doc.getElementById('itembox').scrollTop ,eachChild:eachChild });
				});
			}));
			// 表示
			$menu.css({
				left: (($(win).width() -ev.pageX) < $menu.width())? ev.pageX -$menu.width() : ev.pageX
				,top: (($(win).height() -ev.pageY) < $menu.height())? ev.pageY -$menu.height() : ev.pageY
			}).show();
			return false;	// 既定右クリックメニュー出さない
		}
	}
});
$('#newurl').keypress(function(ev){
	switch( ev.which || ev.keyCode || ev.charCode ){
	case 13: $('#newitem').click(); return false;
	}
});
// 検索
// TODO:タイトルかURLか選択、大小文字区別などオプション追加？
var findopt = function(){
	var isRegex = false;
	// IE8やFirefoxはリロードしてもチェック状態が維持されるので、それを取得保持しようとしたが、IE8は
	// ここで$.prop('checked')しても(チェックされているにもかかわらず)falseになってしまうもよう。
	// setTimeoutで後まわし実行したら正しく取得できた。
	setTimeout(function(){
		isRegex = $('#fregex').change(function(){ isRegex = $(this).prop('checked'); }).prop('checked');
	},0);
	return {
		 regex:function(){ return isRegex; }
		,show:function(){
			var $box = $('#findopt');
			if( $box.css('display')=='none' ){
				// 表示
				var $find = $('#find');
				if( $find.css('display')=='none' ) $find = $('#findstop');
				var $keyword = $('#keyword');
				var area = $find.offset();
				$box.css({
					 left : area.left
					,top  : area.top + $find.outerHeight()
					,width: $keyword.offset().left + $keyword.outerWidth() - area.left
				})
				.show();
				// 自身・検索アイコン・キーワード入力欄をあわせた矩形領域にカーソルがある間は表示
				area.right = area.left + $box.outerWidth();
				area.bottom = area.top + $box.outerHeight() + $find.outerHeight()
				$(doc).on('mousemove.findopt',function(ev){
					if( ev.pageX < area.left || area.right < ev.pageX ||
						ev.pageY < area.top || area.bottom < ev.pageY ){
						$box.hide();
						$(doc).off('mousemove.findopt');
					}
				});
			}
		}
	};
}();
$('#find').click(function(){ itemList('finds'); }).mouseenter( findopt.show ).focus( findopt.show );
$('#findstop').mouseenter( findopt.show ).focus( findopt.show );
$('#keyword').keypress(function(ev){
	switch( ev.which || ev.keyCode || ev.charCode ){
	case 13: $('#find').click(); return false; // Enter検索実行
	}
}).keydown(function(ev){
	switch( ev.which || ev.keyCode || ev.charCode ){
	case 40: $('#fregex').focus(); return false; // ↓で正規表現チェックボックスにフォーカス移動
	}
}).mouseenter( findopt.show ).focus( findopt.show );
$('#fregex').keydown(function(ev){
	switch( ev.which || ev.keyCode || ev.charCode ){
	case 38: $('#keyword').focus(); return false; // ↑で検索キーワードにフォーカス移動
	}
});
// 新旧100
$('#new100').click(function(){ itemList('finds','new100'); });
$('#old100').click(function(){ itemList('finds','old100'); });
// すべて選択
// TODO:アイテム欄が表示中だとぜんぶ選択されない
$('#selectall').click(function(){
	// 選択フォルダ非アクティブ
	$(selectFolder).addClass('inactive');
	// アイテム全選択
	for( var items=doc.getElementById('items').children ,i=0 ,n=items.length; i<n; i++ ){
		$(items[i]).removeClass('inactive').addClass('select');
	}
	$(select=items[i-1]).focus();
});
// 削除
// TODO:削除後に選択フォルダ選択アイテムが初期化されてしまう。近いエントリを選択すべきか。
$('#delete').click(function(){
	if( select.id.indexOf('item')==0 ){
		// アイテム欄
		if( itemList('?')=='child' ){
			// 通常
			var hasFolder=false, ids=[];
			for( var items=doc.getElementById('items').children ,i=0 ,n=items.length; i<n; i++ ){
				var item = items[i];
				if( $(item).hasClass('select') ){
					if( $(item).hasClass('folder') ) hasFolder = true;
					ids.push(item.id.slice(4));
				}
			}
			if( ids.length<=0 ) return;
			var redraw = function(){
				if( hasFolder ) folderTree({ clickID:selectFolder.id.slice(6) });
				else{
					itemList(
						 tree.node( selectFolder.id.slice(6) )
						,{ scrollTop:doc.getElementById('itembox').scrollTop }
					);
				}
			};
			if( tree.trashHas(ids[0]) ){
				// ごみ箱
				Confirm({
					msg:'!'+ ids.length +'個のアイテムを完全に消去します。'
					,ok:function(){ tree.eraseNodes( ids ); redraw(); }
				});
			}
			else{ tree.moveChild( ids, tree.trash() ); redraw(); }
		}
		else{
			// 検索結果・リンク切れ調査結果
			var hasFolder=false, trashIDs=[], otherIDs=[], trashTitles='<ul>';
			for( var items=doc.getElementById('items').children ,i=0 ,n=items.length; i<n; i++ ){
				var item = items[i];
				if( $(item).hasClass('select') ){
					if( $(item).hasClass('folder') ) hasFolder = true;
					var nid = item.id.slice(4);
					if( tree.trashHas(nid) ){
						trashIDs.push(nid);
						trashTitles += '<li>'+$(item).children('.title').text()+'</li>';
					}
					else otherIDs.push(nid);
				}
			}
			trashTitles += '</ul>';
			var redraw = function(){
				tree.moveChild( otherIDs.slice(0), tree.trash() );
				if( hasFolder ){
					// おなじフォルダを選択状態に
					var nid = selectFolder.id.slice(6);
					// フォルダが消えた場合トップフォルダを選択状態に
					if( !tree.node(nid) ) nid = tree.top().id;
					folderTree({ selectID:nid ,inactive:true });
				}
				// 調査中にごみ箱を空にした場合など既にノードが存在しない場合がある。
				// 存在しないノードは「移動しました」メッセージは出さずに消えるのみ。
				for( var i=otherIDs.length; i--; ) if( !tree.node(otherIDs[i]) ) otherIDs.splice(i,1);
				if( otherIDs.length ) Notify(otherIDs.length+'個のアイテムをごみ箱に移動しました。');
				// アイテム欄で既に存在しないものを消去
				for( var items=doc.getElementById('items').children ,i=items.length; i--; ){
					if( !tree.node(items[i].id.slice(4)) ) $(items[i]).remove();
				}
			};
			if( trashIDs.length>0 ){
				Confirm({
					width:400 ,height:210 + trashIDs.length *19
					,resize:true
					,msg:'!'+ trashIDs.length +'個のごみ箱アイテムを完全に消去します。'
					,$e:$(trashTitles)
					,ok:function(){ tree.eraseNodes( trashIDs.slice(0) ); redraw(); }
				});
			}
			else if( otherIDs.length>0 ) redraw();
		}
	}
	else{
		// フォルダツリー
		var nid = select.id.slice(6);
		if( tree.movable(nid) ){
			if( tree.trashHas(nid) ){
				Confirm({
					msg:'!フォルダ「' +$('.title',select).text() +'」を完全に消去します。'
					,ok:function(){
						var pid = tree.nodeParent(nid).id; // 親フォルダを選択
						tree.eraseNode( nid );
						switch( itemList('?') ){
						case 'finds':
						case 'deads':
							folderTree({ selectID:pid });
							// アイテム欄で既に存在しないものを消去
							for( var items=doc.getElementById('items').children ,i=items.length; i--; ){
								if( !tree.node(items[i].id.slice(4)) ) $(items[i]).remove();
							}
							break;
						case 'child': folderTree({ clickID:pid }); break;
						}
					}
				});
			}
			else{
				tree.moveChild( [nid], tree.trash() );
				switch( itemList('?') ){
				case 'finds':
				case 'deads': folderTree({ selectID:nid }); break;
				case 'child': folderTree({ clickID:nid }); break;
				}
			}
		}
	}
});
// リンク切れ調査(全フォルダ)
$('#deadlink').click(function(){
	Confirm({
		height:210
		,msg:'i全フォルダ(全ブックマークURL)のリンク切れ調査を行います。 ブックマーク数が多いほど時間がかかります。'
		,ok:function(){ itemList('deads',tree.root); }
	});
});
// ツールバーボタンEnterでクリック
$('.barbtn').keypress(function(ev){
	switch( ev.which || ev.keyCode || ev.charCode ){
	case 13: $(this).click(); return false;
	}
});
// スクロールで編集ボックス確定(blurが発生しないので強制発行)
$('#folderbox,#itembox').on('scroll',function(){ $('#editbox').blur(); });
// ボーダードラッグ
$('#border').mousedown(function(ev){
	$('#editbox').blur();
	var $border = $(this).addClass('drag');
	var $folderbox = $('#folderbox');
	var $itembox = $('#itembox');
	var $items = $('#items');
	var $itemheadLast = $('#itemhead span').last();	// アイテム欄右端の項目ヘッダ(.date)
	var $itemsLast = $('#items').find('.'+$itemheadLast.attr('class'));
	var toolbarHeight = $('#toolbar').outerHeight();
	var folderboxWidth = $folderbox.width();
	var itemboxWidth = $itembox.width();
	var itemsWidth = $items.width();
	var itemheadLastWidth = $itemheadLast.width();
	var itemsLastWidth = $itemsLast.length? $itemsLast.width() : 0;
	var downX = ev.pageX;
	$(doc).on('mousemove.border',function(ev){
		var dx = ev.pageX -downX;
		var newFolderboxWidth = folderboxWidth +dx;
		var newItemboxWidth = itemboxWidth -dx;
		var newItemsWidth = itemsWidth -dx;
		var newItemheadLastWidth = itemheadLastWidth - dx;
		var newItemsLastWidth = itemsLastWidth - dx;
		if( newFolderboxWidth >20 && newItemsLastWidth >20 ){
			$folderbox.width( newFolderboxWidth );
			$border.css({ left:newFolderboxWidth ,top:toolbarHeight });
			$itembox.width( newItemboxWidth );
			$('#itemhead').width( newItemboxWidth );
			$('#deadinfo').width( newItemboxWidth );
			$items.width( newItemsWidth );
			$itemheadLast.width( newItemheadLastWidth );
			if( itemsLastWidth ) $itemsLast.width( newItemsLastWidth );
		}
	})
	.one('mouseup',function(){
		$(doc).off('mousemove.border');
		$border.removeClass('drag');
		// TODO:位置保存する…？
	});
});
// アイテム欄項目ヘッダのボーダー
$('.itemborder').mousedown(function(ev){
	$('#editbox').blur();
	var $attrhead = $(this).prev();				// クリックしたボーダの左側の項目ヘッダ(.title/.url/.misc)
	var $lasthead = $('#itemhead span').last();	// 右端の項目ヘッダ(.date)
	var $attr='', $smry='';
	if( $attrhead.hasClass('title') ){
		$attr = $('#items').find('.title');
	}else{
		var selector = '.'+$attrhead.attr('class');
		if( selector=='.misc' ) selector = '.iconurl, .place, .status';
		$attr = $('#items').find( selector );
		$smry = $('#items').find('.summary');
	}
	$attrhead.addClass('drag');
	var $last = $('#items').find('.'+$lasthead.attr('class'));
	var attrheadWidth = $attrhead.width();
	var lastheadWidth = $lasthead.width();
	var attrWidth = $attr.length? $attr.width() : 0;
	var smryWidth = $smry.length? $smry.width() : 0;
	var lastWidth = $last.length? $last.width() : 0;
	var downX = ev.pageX;
	$(doc).on('mousemove.itemborder',function(ev){
		var dx = ev.pageX - downX;
		var newAttrheadWidth = attrheadWidth + dx;
		var newLastheadWidth = lastheadWidth - dx;
		var newAttrWidth = attrWidth + dx;
		var newSmryWidth = smryWidth + dx;
		var newLastWidth = lastWidth - dx;
		if( newAttrWidth >20 && newLastWidth >20 ){
			$attrhead.width( newAttrheadWidth );
			$lasthead.width( newLastheadWidth );
			if( attrWidth ) $attr.width( newAttrWidth );
			if( smryWidth ) $smry.width( newSmryWidth );
			if( lastWidth ) $last.width( newLastWidth );
		}
	})
	.one('mouseup',function(){
		$(doc).off('mousemove.itemborder');
		$attrhead.removeClass('drag');
		// TODO:位置保存する…？
	});
});
$('#itembox').on({
	// アイテム欄下余白から矩形選択
	mousedown:function(ev){
		$('#editbox').blur();
		var downX = ev.pageX;
		var downY = ev.pageY;
		var offset = $(this).offset();
		var $items = $('#items');
		// スクロールバー上でない、かつ(IE8で必要)アイテム上でない
		if( downX < offset.left + this.clientWidth &&
			downY < offset.top + this.clientHeight &&
			downY > $items.offset().top + $items.height()
		){
			// 選択フォルダ非アクティブ
			$(selectFolder).addClass('inactive');
			if( ev.ctrlKey ){
				// 選択アイテムをアクティブに
				for( var items=$items[0].children ,i=items.length; i--; ){
					$(items[i]).removeClass('inactive');
				}
			}else{
				// 選択なし
				selectItemClear();
			}
			itemSelectStart( null, downX, downY );
		}
	}
	// アイテム欄下余白コンテキストメニュー
	,contextmenu:function(ev){
		var itembox = this;
		if( itemList('?')=='child' && (ev.target.className=='spacer' || ev.target.id=='itembox') ){
			var $menu = $('#contextmenu').width( 210 );
			var $box = $menu.children('div').empty();
			if( isLocalServer ){
				$menu.width( 250 );
				$box.append($('<a><img src=newitem.png>クリップボードのURLを新規登録</a>').click(function(){
					$menu.hide();
					// 選択フォルダ末尾に登録
					var pnode = tree.node( selectFolder.id.slice(6) );
					clipboardTo( pnode ,pnode.child.length ,function( nodes ){
						var eachChild = function(){
							// アイテム欄内でDOM作成ループがおわるたびに
							for( var i=nodes.length; i--; ){
								// 新アイテム要素発見したら選択状態にして配列から除外
								var item = doc.getElementById('item'+ nodes[i].id );
								if( item ){
									// 先頭アイテムだけCtrlキー押下クリック(遅い)、それ以外は速いaddClass
									if( i==0 ) $(item).trigger('selfclick',[false,true]);
									else $(item).addClass('select');
									nodes.splice(i,1);
								}
								else break;
							}
						};
						itemList( pnode ,{ scrollTop:itembox.scrollTop ,eachChild:eachChild });
					});
				}));
			}
			$box.append($('<a><img src=newfolder.png>新規フォルダ作成</a>').click(function(){
				$menu.hide();
				// 末尾に新規フォルダ作成
				var pnode = tree.node( selectFolder.id.slice(6) );
				var node = tree.newFolder( '' ,pnode ,pnode.child.length );
				// フォルダツリー更新
				var $item = [];
				folderTree({
					 clickID:selectFolder.id.slice(6)
					// 新フォルダ選択
					// TODO:アイテム欄内フォルダ展開してると画面チカチカするレベル
					,itemOption:{
						 scrollTop:itembox.scrollTop
						,eachChild:function(){
							if( !$item.length ){
								$item = $('#item'+ node.id ).trigger('selfclick');
							}
							if( $item.length ){
								// 名前変更・テキスト選択
								edit( $item.children('.title')[0] ,{ select:true });
							}
						}
					}
				});
			}));
			// 表示
			$menu.css({
				left: (($(win).width() -ev.pageX) < $menu.width())? ev.pageX -$menu.width() : ev.pageX
				,top: (($(win).height() -ev.pageY) < $menu.height())? ev.pageY -$menu.height() : ev.pageY
			}).show();
			return false;	// 既定右クリックメニュー出さない
		}
	}
});
$('#folderbox .spacer, #itembox .spacer').on('mouseleave',itemMouseLeave);
// 独自フォーマット時刻文字列
function myFmt( date, now ){
	// 0=1970/1/1は空
	var diff = date.getTime();
	if( diff <1 ) return '';
	// YYYY/MM/DD HH:MM:SS
	var Y = date.getFullYear();
	var M = date.getMonth() +1;
	var D = date.getDate();
	var h = date.getHours();
	var m = date.getMinutes();
	var s = date.getSeconds();
	var date = ((M<10)?'0'+M:M) +'/' +((D<10)?'0'+D:D);
	var time = ((h<10)?'0'+h:h) +':' +((m<10)?'0'+m:m) +':' +((s<10)?'0'+s:s);
	// 現在時刻との差分
	diff = ((now - diff) /1000)|0;
	if( diff <=10 ) return 'いまさっき (' +time +')';
	if( diff <=60 ) return '1分以内 (' +time +')';
	if( diff <=3600 ) return ((diff /60)|0) +'分前 (' +time +')';
	if( diff <=3600*1.5 ) return '1時間前 (' +time +')';
	if( diff <=3600*24 ) return Math.round(diff /3600) +'時間前 (' +date +' ' +time +')';
	if( diff <=3600*24*30 ) return Math.round(diff /3600 /24) +'日前 (' +date +' ' +time +')';
	return Y +'/' +date +' ' +time;
}
// 画面縦横サイズ変更：windowから呼ばれた時はフォルダ欄の幅を維持し、それ以外は一定比率で決める
// TODO:スクロールバーの幅を決め打ちじゃなく取得したい。
// http://defghi1977-onblog.blogspot.jp/2012/10/blog-post_4.html
function resize(){
	$('#editbox').blur();
	var windowWidth = $(win).width(); // 適当-1px
	var toolbarHeight = $('#toolbar').outerHeight() +(tree.modified()? $('#modified').outerHeight():0);
	var folderboxWidth = (this==win)? $('#folderbox').width() : (windowWidth /5.4)|0;
	var folderboxHeight = $(win).height() -toolbarHeight;
	var borderWidth = $('#border').outerWidth();
	var itemboxWidth = windowWidth -folderboxWidth -borderWidth;
	if( itemboxWidth <20 ){	// アイテム欄狭すぎ自動調整20px適当
		folderboxWidth = (windowWidth /5.4)|0;
		itemboxWidth = windowWidth -folderboxWidth -borderWidth;
	}
	var itemsWidth = ((itemboxWidth <400)? 400 : itemboxWidth) -17;			// スクロールバー17px(?)
	var titleWidth = (itemsWidth /2.22)|0;									// 割合適当
	var urlWidth = ((itemsWidth -titleWidth) /2.5)|0;						// 割合適当
	var iconWidth = ((itemsWidth -titleWidth -urlWidth) /1.75)|0;			// 割合適当
	var dateWidth = itemsWidth -titleWidth -urlWidth -iconWidth;
	var itemboxHeight = folderboxHeight
			- $('#itemhead')
				.width( itemboxWidth )
				.css('left',borderWidth )
				.children('.title').width( titleWidth ).end()
				.children('.url').width( urlWidth ).end()
				.children('.misc').width( iconWidth ).end()
				.children('.date').width( dateWidth ).end()
				.outerHeight()
			- $('#deadinfo')
				.width( itemboxWidth )
				.css('left',borderWidth )
				.outerHeight();
	var spacerHeight = itemboxHeight -4 // dropTopボーダー4px
			- $('#items')
				.width( itemsWidth )
				.find('.title').width( titleWidth -(itemList('?')=='child'? 38:25) ).end()	// #itemheadと合うよう調節
				.find('.url').width( urlWidth -1 ).end()						// #itemheadと合うよう調節
				.find('.iconurl, .place, .status').width( iconWidth -1 ).end()	// #itemheadと合うよう調節
				.find('.summary').width( urlWidth +iconWidth +4 ).end()			// #itemheadと合うよう調節
				.find('.date').width( dateWidth -12 ).end()						// float対策適当-12px
				.outerHeight();
	if( spacerHeight <0 ) spacerHeight = 48; // アイテム欄余白高さ48px以上

	$('#toolbar') // ボタン類がfloatで下にいかないよう
		.width( (windowWidth <780)? 780 : windowWidth );
	$('#folderbox')
		.width( folderboxWidth )
		.height( folderboxHeight );
	$('#itembox')
		.width( itemboxWidth )
		.height( itemboxHeight )
		.css('left',borderWidth )
		.children('.spacer').height( spacerHeight );
	$('#border')
		.height( folderboxHeight +1 )
		.css({ left:folderboxWidth ,top:toolbarHeight });
}
// 画面サイズ縦のみ変更
function resizeV( paddingTop ){
	var toolbarHeight = $('#toolbar').outerHeight() +( paddingTop ||0 );
	var folderboxHeight = $(win).height() -toolbarHeight;
	var itemboxHeight =  folderboxHeight -$('#itemhead').outerHeight() -$('#deadinfo').outerHeight();
	var spacerHeight = itemboxHeight - $('#items').outerHeight() -4; // dropTopボーダー4px
	if( spacerHeight <0 ) spacerHeight = 48; // アイテム欄余白高さ48px以上
	$('#folderbox').height( folderboxHeight );
	$('#border').height( folderboxHeight +1 ).css('top',toolbarHeight );
	$('#itembox').height( itemboxHeight ).children('.spacer').height( spacerHeight );
}
// アイテム欄余白高さ調節
function spacerHeight(){
	var $itembox = $('#itembox');
	var h = $itembox.height() - $('#items').outerHeight() -4; // dropTopボーダー4px
	$itembox.children('.spacer').height( h<0 ? 48 : h ); // 48px以上
}
// 矩形選択
// TODO:アイテム欄の上下自動スクロール
function itemSelectStart( element, downX, downY ){
	// 矩形表示
	$('#selectbox').css({ left:downX, top:downY, width:1, height:1 }).show();
	// アイテム状態保持
	var items = [];
	$('#items').children().each(function(){
		if( this!=element ){
			items.push({
				$: $(this)
				,selected: $(this).hasClass('select')? true:false
			});
		}
	});
	// ドラッグイベント
	$(doc).on('mousemove.select',function(ev){
		// 矩形表示
		var rect = $.extend(
			(ev.pageX > downX)? { left:downX, width:ev.pageX -downX } :{ left:ev.pageX, width:downX -ev.pageX },
			(ev.pageY > downY)? { top:downY, height:ev.pageY -downY } :{ top:ev.pageY, height:downY -ev.pageY }
		);
		var rectBottom = rect.top + rect.height;
		$('#selectbox').css( rect );
		// 選択切り替え
		for( var i=items.length; i--; ){
			var item = items[i];
			var offset = item.$.offset();
			if( offset.top >= rect.top-15 && offset.top <= rectBottom-4 ){
				// 矩形内は選択逆転
				if( item.selected ) item.$.removeClass('select');
				else item.$.addClass('select'), select=item.$[0];
			}
			else{
				// 矩形外は元通り
				if( item.selected ) item.$.addClass('select'), select=item.$[0];
				else item.$.removeClass('select');
			}
		}
	})
	.one('mouseup',function(){
		$(doc).off('mousemove.select');
		$('#selectbox').hide();
	});
}
// ノードツリー保存
function treeSave( arg ){
	$('#modified').hide();
	$('#progress').show();
	tree.save({
		error:function(){
			$('#progress').hide();
			$('#modified').show();
		}
		,success:function(){
			$('#progress').hide();
			$(doc.body).css('padding-top',0);
			resizeV();
			if( arg && arg.success ) arg.success();
		}
	});
}
// マウスイベント
// TODO:フォルダツリーもshift/ctrlキー押しながらクリックで複数選択してD&Dできるように
function folderClick( ev ,itemOption ){
	// ＋－ボタンは無視
	if( ev.target.className=='sub' ) return;
	if( itemList('?')=='child' && $(this).hasClass('select') ){
		var $this = $(select=this);
		// 選択アイテムを非アクティブに
		for( var items=doc.getElementById('items').children ,i=items.length; i--; ){
			var $item = $(items[i]);
			if( $item.hasClass('select') ) $item.addClass('inactive');
		}
		if( $this.hasClass('inactive') ){
			// 非アクティブはアクティブに
			$this.removeClass('inactive').focus();
		}
		else{
			// アクティブなら名前編集
			//edit( doc.elementFromPoint( ev.pageX, ev.pageY ) );
			// なぜかIE8でelementFromPointが動作せず、さらに.title要素を
			// inline-blockにしたら文字上クリックでしか編集できなくなった
			// ので、自力判定でblock要素のように文字上じゃなくても編集で
			// きるように変えた。jQueryオブジェクトの[0]がDOMエレメント
			// らしい。
			//var elm = $(this).find('.title')[0];
			//if( ev.pageX+3 >= elm.offsetLeft ) edit( elm );
			// フォルダツリーで横にスクロールした状態だと編集ボックスが出る
			// クリック領域がスクロール量だけ右にズレてしまうので以下に変更。
			var $e = $this.focus().find('.title');
			if( ev.pageX+3 >= $e.offset().left ) edit( $e[0] );
		}
	}
	else{
		// ノード取得:自身ID=folderXXならノードID=XX
		var node = tree.node( this.id.slice(6) );
		if( node ){
			// クリックフォルダ選択状態に
			$(selectFolder).removeClass('select').removeClass('inactive');
			$(select=selectFolder=this).addClass('select').focus();
			// アイテム欄作成
			itemList( node ,itemOption );
		}
	}
}
function folderDblClick(ev){
	// ＋－ボタンダブルクリック無視
	if( ev.target.className=='sub' ) return;
	// サブツリー展開
	for( var e=this.children, i=0, n=e.length; i<n; i++ ){
		if( e[i].className=='sub' ) return subTreeIcon.call( e[i] );
	}
}
function itemSelfClick( ev, shiftKey ,ctrlKey ){
	var data = [ shiftKey ,ctrlKey ];
	if( IE && IE<9 ){
		// IE8はmousedown()でエラー発生する仕様なのが影響してか、
		// mouseup()が実行されない？仕方がないのでsetTimeoutを使う。
		var $this = $(this);
		setTimeout(function(){ $this.trigger('mousedown',data); },0);
		setTimeout(function(){ $this.mouseup().click()/*.focus()*/; },1);
	}
	else{
		$(this).trigger('mousedown',data).mouseup().click()/*.focus()*/;
	}
}
function itemMouseDown( ev, shiftKey ,ctrlKey ){
	$('#editbox').blur();
	// ＋－ボタンは無視
	if( ev.target.className=='appear' ) return;
	// イベント間通知
	ev.data.itemID = this.id;
	ev.data.itemNotify = '';
	ev.shiftKey = shiftKey || ev.shiftKey;
	ev.ctrlKey = ctrlKey || ev.ctrlKey;
	// 選択フォルダ非アクティブ
	$(selectFolder).addClass('inactive');
	// 選択アイテムをアクティブに
	for( var items=doc.getElementById('items').children ,i=items.length; i--; ){
		$(items[i]).removeClass('inactive');
	}
	// アイテムはマウスダウンで選択状態にする(ちなみにフォルダツリーはクリック)
	// "単選択"とは、通常クリックおよびCtrl+クリックのこと。
	if( ev.ctrlKey && ev.shiftKey ){
		// 最後に単選択したアイテムとthisの間を全選択して追加？
		// だけではない、条件によって単選択だったり範囲選択だったり
		// Windowsエクスプローラの挙動が謎なので実装しない。
	}else if( ev.shiftKey ){
		if( selectItemLast ){
			// 最後に単選択したアイテムとthisの間の全選択に差し替え
			var id={};
			if( $(selectItemLast).offset().top > $(this).offset().top ){
				// thisが上側にある
				id.begin = this.id;
				id.end = $(selectItemLast).attr('id');
			}else{
				// thisが下側にある
				id.begin = $(selectItemLast).attr('id');
				id.end = this.id;
			}
			var isTarget = false;
			for( var items=doc.getElementById('items').children ,i=0 ,n=items.length; i<n; i++ ){
				var item=items[i];
				if( item.id==id.begin ) isTarget = true;
				isTarget? $(item).addClass('select') :$(item).removeClass('select');
				if( item.id==id.end ) isTarget = false;
			}
			// ドラッグ開始
			itemDragStart( this, ev.pageX, ev.pageY );
		}else{
			// なにも選択されてないので単選択
			$(select=selectItemLast=this).addClass('select').focus();
			// 矩形選択
			itemSelectStart( this, ev.pageX, ev.pageY );
		}
	}else if( ev.ctrlKey ){
		// 単選択(選択追加)
		if( $(this).hasClass('select') ){
			// 選択済みアイテムはmouseup(click)で選択解除する。
			// (ここで解除するとドラッグできなくなる)
			ev.data.itemNotify = 'unselect';
		}else{
			// 未選択は選択
			$(select=selectItemLast=this).addClass('select').focus();
			// 矩形選択
			itemSelectStart( this, ev.pageX, ev.pageY );
		}
	}else{
		// 単選択(差し替え)
		if( $(this).hasClass('select') ){
			$(select=selectItemLast=this).focus();
			// 選択済みアイテムの数
			var selectCount=0;
			for( var items=doc.getElementById('items').children ,i=items.length; i--; ){
				if( $(items[i]).hasClass('select') ) selectCount++;
			}
			// 複数選択されていた場合、mouseup(click)で単選択に差し替え。
			// (ここで選択解除するとドラッグできなくなるダメ)
			// 単選択だった場合、mouseup(click)で名前変更。
			ev.data.itemNotify = ( selectCount >1 )? 'select1' :'edit';
			// ドラッグ開始
			itemDragStart( this, ev.pageX, ev.pageY );
		}else{
			// 未選択はここで差し替え単選択
			selectItemClear();
			$(select=selectItemLast=this).addClass('select').focus();
			// 矩形選択
			itemSelectStart( this, ev.pageX, ev.pageY );
		}
	}
	// TODO:[IE8]なぜかエラー発生させると画像アイコンドラッグ可能になるが、
	// ウィンドウ外ドラッグができなく(mousemoveが発生しなく)なる。
	// 他に適切な対策はないのか？
	if( IE && IE<9 )xxxxx;
}
function folderMouseDown(ev){
	$('#editbox').blur();
	// ＋－ボタンは無視
	if( ev.target.className=='sub' ) return;
	// ドラッグ開始
	if( tree.movable( this.id.slice(6) ) ) itemDragStart( this, ev.pageX, ev.pageY );
	// TODO:[IE8]なぜかエラー発生させると画像アイコンドラッグ可能になるが、
	// ウィンドウ外ドラッグができなく(mousemoveが発生しなく)なる。
	// 他に適切な対策はないのか？
	if( IE && IE<9 )xxxxx;
}
// サブツリー展開
function subTreeIcon(){
	var $my = $(this);
	var $fo = $(this.parentNode);
	var paddingLeft = parseInt($fo.css('padding-left')||0) +15;	// +15px <img class=sub> の幅
	if( /plus.png$/.test(this.src) ){
		for( var $fo=$fo.next(); $fo.hasClass('folder'); $fo=$fo.next() ){
			if( paddingLeft < parseInt($fo.css('padding-left')||0) )
				$fo = subView( $fo.show() );
			else
				break;
		}
		$my.attr('src','minus.png');
	}
	else{
		for( var $fo=$fo.next(); $fo.hasClass('folder'); $fo=$fo.next() ){
			if( paddingLeft < parseInt($fo.css('padding-left')||0) )
				$fo.hide();
			else
				break;
		}
		$my.attr('src','plus.png');
	}
	// サブツリー表示状態を(アイコンで判定して)復帰
	function subView( $fo ){
		var child0 = $fo[0].children[0];
		if( child0.className=='sub' ){
			var show = /minus.png$/.test(child0.src);
			var paddingLeft = parseInt($fo.css('padding-left')||0) +15;	// +15px <img class=sub> の幅
			for( var $nx=$fo.next(); $nx.hasClass('folder'); $nx=$nx.next() ){
				if( paddingLeft < parseInt($nx.css('padding-left')||0) ){
					if( show ) $nx = subView( $nx.show() );
					$fo = $nx;
				}
				else break;
			}
		}
		return $fo;
	}
}
// アイテム欄内フォルダ展開
function appearIcon(){
	if( /plus.png$/.test(this.src) ){
		this.src = 'minus.png';
		itemList('appear',this.parentNode);
	}
	else{
		this.src = 'plus.png';
		itemList('disappear',this.parentNode);
	}
}
// アイテムドラッグ中自動スクロール
function itemDragScroller(){
	var folderbox = doc.getElementById('folderbox');
	var itembox = doc.getElementById('itembox');
	// フォルダ欄上領域
	var folderTop = {
		X0	:folderbox.offsetLeft
		,Y0	:folderbox.offsetTop
		,X1	:folderbox.offsetLeft +folderbox.clientWidth
		,Y1	:folderbox.offsetTop +36
	};
	// フォルダ欄下領域
	var folderBottom = {
		X0	:folderbox.offsetLeft
		,Y0	:folderbox.offsetTop +folderbox.clientHeight -36
		,X1	:folderbox.offsetLeft +folderbox.clientWidth
		,Y1	:folderbox.offsetTop +folderbox.clientHeight
	};
	// アイテム欄上領域
	var itemTop = {
		X0	:itembox.offsetLeft
		,Y0	:itembox.offsetTop
		,X1	:itembox.offsetLeft +itembox.clientWidth
		,Y1	:itembox.offsetTop +36
	};
	// アイテム欄下領域
	var itemBottom = {
		X0	:itembox.offsetLeft
		,Y0	:itembox.offsetTop +itembox.clientHeight -36
		,X1	:itembox.offsetLeft +itembox.clientWidth
		,Y1	:itembox.offsetTop +itembox.clientHeight
	};
	// setIntervalのID
	var timer = null;
	// スクロール関数
	function scroller( box, value ){
		var old = box.scrollTop;
		box.scrollTop += value;
		if( old==box.scrollTop ) clearInterval(timer), timer=null;
	}
	// mousemove/mouseupイベントで呼ばれる関数返却
	return function(ev){
		if( ev ){
			// ドラッグ中に上端/下端に近づいたらスクロールさせる
			if( ev.pageX >=folderTop.X0 && ev.pageX <=folderTop.X1 ){
				if( ev.pageY >=folderTop.Y0 && ev.pageY <=folderTop.Y1 ){
					//$debug.text('フォルダ欄で上スクロール');
					if( !timer ) timer = setInterval(function(){scroller(folderbox,-30);},100);
				}
				else if( ev.pageY >=folderBottom.Y0 && ev.pageY <=folderBottom.Y1 ){
					//$debug.text('フォルダ欄で下スクロール');
					if( !timer ) timer = setInterval(function(){scroller(folderbox,30);},100);
				}
				else{
					//$debug.text('スクロールなし');
					if( timer ) clearInterval(timer), timer=null;
				}
			}
			else if( ev.pageX >=itemTop.X0 && ev.pageX <= itemTop.X1 ){
				if( ev.pageY >=itemTop.Y0 && ev.pageY <=itemTop.Y1 ){
					//$debug.text('アイテム欄で上スクロール');
					if( !timer ) timer = setInterval(function(){scroller(itembox,-30);},100);
				}
				else if( ev.pageY >=itemBottom.Y0 && ev.pageY <=itemBottom.Y1 ){
					//$debug.text('アイテム欄で下スクロール');
					if( !timer ) timer = setInterval(function(){scroller(itembox,30);},100);
				}
				else{
					//$debug.text('スクロールなし');
					if( timer ) clearInterval(timer), timer=null;
				}
			}
			else{
				//$debug.text('スクロールなし');
				if( timer ) clearInterval(timer), timer=null;
			}
		}
		else{
			// スクロール停止
			if( timer ) clearInterval(timer), timer=null;
		}
	};
}
function itemDragStart( element, downX, downY ){
	// スクロール制御関数
	var scroller = itemDragScroller();
	// ドラッグ開始判定関数
	function itemDragJudge(ev){
		if( (Math.abs(ev.pageX-downX) +Math.abs(ev.pageY-downY)) >9 ){
			// ある程度カーソル移動したらドラッグ開始
			draggie = element;
			// ドラッグ中スタイル適用
			if( draggie.id.indexOf('item')==0 ){
				// アイテム欄でドラッグ
				dragItem = { ids:[], itemCount:0, folderCount:0 };
				for( var items=doc.getElementById('items').children ,i=0 ,n=items.length; i<n; i++ ){
					var item=items[i] ,$item=$(item);
					if( $item.hasClass('select') ){
						$item.addClass('draggie');
						dragItem.ids.push( item.id.slice(4) );
						if( $item.hasClass('folder') )
							dragItem.folderCount++;
						else
							dragItem.itemCount++;
					}
				}
			}else{
				// フォルダツリーでドラッグ
				$(draggie).addClass('draggie');
				dragItem = { ids:[ draggie.id.slice(6) ], folderCount:1 };
			}
			// ドラッグボックス表示
			// <img>タグは$('img',draggie).html()で取れないの？
			$('#dragbox').empty().text( $('.title',draggie).text() )
			.prepend( $('<img class=icon>').attr('src', $('.icon',draggie).attr('src')) ).show();
		}
	}
	// イベント
	$(doc).on('mousemove.itemdrag',function(ev){
		if( !draggie ) itemDragJudge(ev);
		if( draggie ){
			// ドラッグボックス移動
			$('#dragbox').css({ left:ev.pageX+5, top:ev.pageY+5 });
			// スクロール
			scroller(ev);
		}
	})
	// TODO:アイテム欄より上にいる時にアイテム先頭にドロップ(ちょと面倒…)
	.on('mousemove.itemdrag','.folder, .item, .spacer',function(ev){
		if( !draggie ) itemDragJudge(ev);
		if( draggie ){
			// ドラッグ先が自分の時は何もしない
			if( draggie.id==this.id ) return;
			var $this = $(this);
			// 複数選択ドラッグアイテムどうしは何もしない(ドロップ不可)
			if( draggie.id.indexOf('item')==0 && $this.hasClass('select') && this.id.indexOf('item')==0 ) return;
			// ドロップ要素スタイル適用
			$this.removeClass('dropTop').removeClass('dropBottom').removeClass('dropIN');
			// 余白
			if( $this.hasClass('spacer') ){
				if( itemList('?')=='child' ) $this.addClass('dropTop'); return;
			}
			// エレメント上端からマウスの距離 Y は 0～22くらいの範囲
			var Y = ev.pageY - $this.offset().top;
			if( draggie.id.indexOf('item')==0 ){
				// アイテム欄から…
				if( dragItem.itemCount ){
					// アイテム(ブックマーク)を含む単選択か複数選択を…
					if( this.id.indexOf('item')==0 ){
						// アイテム欄の…
						if( $this.hasClass('folder') ){
							// フォルダへドロップ
							switch( itemList('?') ){
							case 'child': SiblingAndChild();break;	// 通常
							case 'finds': ChildOnly();		break;	// 検索結果
							}
						}
						else{
							// アイテムへドロップ
							if( itemList('?')=='child' ) SiblingOnly();	// 通常
						}
					}else{
						// フォルダツリーへドロップ
						ChildOnly();
					}
				}else if( dragItem.folderCount ){
					// フォルダのみを…
					if( this.id.indexOf('item')==0 ){
						// アイテム欄の…
						if( $this.hasClass('folder') ){
							// フォルダへドロップ
							switch( itemList('?') ){
							case 'child': SiblingAndChild();break;	// 通常
							case 'finds': ChildOnly();		break;	// 検索結果
							}
						}
						else{
							// アイテムへドロップ
							if( itemList('?')=='child' ) SiblingOnly();	// 通常
						}
					}else{
						// フォルダツリーの…
						if( tree.movable( this.id.slice(6) ) ) SiblingAndChild(); // その他フォルダへドロップ
						else ChildOnly(); // トップフォルダ・ごみ箱へドロップ
					}
				}
			}else{
				// フォルダツリーから…
				if( this.id.indexOf('item')==0 ){
					// アイテム欄の…
					if( $this.hasClass('folder') ){
						// フォルダへドロップ
						switch( itemList('?') ){
						case 'child': SiblingAndChild();break;	// 通常
						case 'finds': ChildOnly();		break;	// アイテム欄が検索結果
						}
					}
					else{
						// アイテムへドロップ
						if( itemList('?')=='child' ) SiblingOnly();	// 通常
					}
				}else{
					// フォルダツリーの…
					if( tree.movable( this.id.slice(6) ) ) SiblingAndChild(); // その他フォルダへドロップ
					else ChildOnly(); // トップフォルダ・ごみ箱へドロップ
				}
			}
		}
		function SiblingAndChild(){
			if( Y <6 ) $this.addClass('dropTop');
			else if( Y >18 ) $this.addClass('dropBottom');
			else $this.addClass('dropIN');
		}
		function SiblingOnly(){
			if( Y <12 ) $this.addClass('dropTop');
			else $this.addClass('dropBottom');
		}
		function ChildOnly(){ $this.addClass('dropIN'); }
	})
	.one('mouseup','.folder, .item, .spacer',function(ev){
		// ここはdocument.mouseupより前に実行されるみたいだけど、
		// その挙動って前提にしちゃってもいいのかな？ダメな場合は改造が面倒だ…。
		if( draggie ){
			// ドラッグ先が自分の時は何もしない
			if( draggie.id==this.id ) return;
			var $this = $(this);
			// ドラッグ中アイテムどうしは何もしない(ドロップ不可)
			if( draggie.id.indexOf('item')==0 && this.id.indexOf('item')==0 && $this.hasClass('select') ) return;
			// ドロップ処理
			if( $this.hasClass('dropTop') ){
				if( $this.hasClass('spacer') ){
					if( this.parentNode.id=='folderbox' ){
						// フォルダツリー余白、ごみ箱末尾に
						tree.moveChild( dragItem.ids.slice(0) ,tree.trash() ,true );
					}
					else{
						// アイテム欄余白、選択フォルダ末尾に
						tree.moveChild( dragItem.ids.slice(0) ,selectFolder.id.slice(6) ,true );
					}
				}
				else{
					//$debug.text(dragItem.ids+' が、'+this.id+' にdropTopされました');
					tree.moveSibling( dragItem.ids.slice(0), this.id.replace(/^\D*/,'') );
				}
			}
			else if( $this.hasClass('dropBottom') ){
				//$debug.text(dragItem.ids+' が、'+this.id+' にdropBottomされました');
				tree.moveSibling( dragItem.ids.slice(0), this.id.replace(/^\D*/,''), true );
			}
			else if( $this.hasClass('dropIN') ){
				//$debug.text(dragItem.ids+' が、'+this.id+' にdropINされました');
				tree.moveChild( dragItem.ids.slice(0), this.id.replace(/^\D*/,'') );
			}
			else return; // ドロップ不可
			$this.removeClass('dropTop').removeClass('dropBottom').removeClass('dropIN');
			// 表示更新
			switch( itemList('?') ){
			case 'finds':
			case 'deads':
				if( dragItem.folderCount >0 ) folderTree({ selectID:selectFolder.id.slice(6) });
				Notify(dragItem.ids.length+'個のアイテムを移動しました。');
				break;
			case 'child':
				var folderID = selectFolder.id.slice(6);
				var dragIDs = dragItem.ids.slice(0);
				var itemOption = {
					 scrollTop:doc.getElementById('itembox').scrollTop
					,eachChild:function(){
						// アイテム欄内でDOM作成ループがおわるたびに
						for( var i=dragIDs.length; i--; ){
							// 新アイテム要素発見したら選択状態にして配列から除外
							var item = doc.getElementById('item'+ dragIDs[i] );
							if( item ){
								// 先頭アイテムだけCtrlキー押下クリック(遅い)、それ以外は速いaddClass
								if( i==0 ) $(item).trigger('selfclick',[false,true]);
								else $(item).addClass('select');
								dragIDs.splice(i,1);
							}
							else break;
						}
					}
				};
				if( dragItem.folderCount >0 )
					folderTree({ clickID:folderID ,itemOption:itemOption });
				else
					itemList( tree.node(folderID) ,itemOption );
				break;
			}
			// なぜかIE8でdragbox消えずdropXXXスタイル解除されない。
			// $(document).mouseup()が実行されていないような挙動にみえるので
			// 実行したらとりあえず問題ないように見える。
			if( IE && IE<9 ) $(doc).mouseup();
		}
	})
	.one('mouseup',function(ev){
		// スクロール停止
		scroller(false);
		// イベント解除
		$(doc).off('mousemove.itemdrag');
		// ドラッグ解除
		$('#dragbox').hide();
		if( draggie ){
			if( draggie.id.indexOf('item')==0 ){
				// アイテム欄でドラッグ
				for( var items=doc.getElementById('items').children ,i=items.length; i--; ){
					$(items[i]).removeClass('draggie');
				}
			}else{
				// フォルダツリーでドラッグ
				$(draggie).removeClass('draggie');
			}
			draggie = null;
			dragItem = {};
		}
	});
}
function itemMouseLeave(){
	if( draggie ) $(this).removeClass('dropTop').removeClass('dropBottom').removeClass('dropIN');
}
function itemClick(ev){
	// 単選択(選択解除)
	if( ev.data.itemID==this.id ){
		switch( ev.data.itemNotify ){
		case 'unselect':
			if( ev.ctrlKey ) $(select=selectItemLast=this).removeClass('select').focus();
			return;
		case 'select1':
			// IE8だと、mousedown地点とmouseup地点がだいぶ離れてドラッグ相当
			// の操作でもこのクリックイベントが実行されてしまい、複数選択が
			// 解除されてしまうようだ。クリックじゃないだろ！と思うが…。
			// 回避するには自分でクリック判定？面倒です。。
			selectItemClear();
			$(select=selectItemLast=this).addClass('select').focus();
			return;
		case 'edit':
			// 名前変更
			// selfclickの時はev.pageXやev.pageYはundefinedなので無視
			if( ev.pageX ) edit( doc.elementFromPoint( ev.pageX, ev.pageY ) );
			return;
		}
	}
}
function itemDblClick(ev){
	// ＋－ボタンは無視
	if( ev.target.className=='appear' ) return;
	if( $(this).hasClass('folder') ){
		// フォルダはフォルダ開く
		// 自身ID=itemXXならフォルダID=folderXX
		var nid = this.id.slice(4);
		for( var pnode = tree.nodeParent(nid);
			pnode && pnode != tree.root;
			pnode = tree.nodeParent(pnode.id)
		){
			var sub = $('#folder'+pnode.id+' .sub')[0];
			if( /plus.png$/.test(sub.src) ) subTreeIcon.call( sub );
		}
		$('#folder'+nid).click();
	}
	else{
		// ブックマークならURL開く
		var url = $(this).find('.url').text();
		if( url.length ) win.open(url);
	}
	return false;
}
// TODO:Opera12で未選択アイテムのコンテキストメニューが出ない。選択アイテムは出る。
// itemMouseDown()のitemSelectStart()をやめたら出た。Opera以外は問題ない。うーむ
// ブラウザ判定はIEしかしてないし、右クリック判定もしてないし、あとまわし…。
// TODO:左ボタンドラッグと右ボタンドラッグを区別していないので、右ドラッグした時に
// たまたまカーソル下に要素があればコンテキストメニューが出て、なければ出ないという
// 挙動になる。右ドラッグ用メニュー「ここに移動」「ここにコピー」などを作るべき？
function itemContextMenu(ev){
	var item = ev.target;
	while( !$(item).hasClass('item') ){
		if( !item.parentNode ) return;
		item = item.parentNode;
	}
	var nid = item.id.slice(4);	// ノードID
	var $menu = $('#contextmenu');
	var $box = $menu.children('div').empty();
	var iopen = $(item).children('.icon').attr('src');
	var width = 220;
	// 開く
	if( $(item).hasClass('folder') ){
		// フォルダ
		$box.append($('<a><img src='+iopen+'>フォルダを開く</a>').click(function(){
			$menu.hide(); $(item).dblclick();
		}));
	}
	else{
		// ブックマーク
		var url = $(item).children('.url').text();
		if( url.length ){
			if( /^javascript:/i.test(url) ){
				$box.append($('<a><img src='+iopen+'>新しいタブで実行</a>').click(function(){
					$menu.hide(); win.open( url );
				}));
				$box.append($('<a><img src='+iopen+'>ここで実行</a>').click(function(){
					$menu.hide(); location.href = url;
				}));
			}
			else{
				$box.append($('<a><img src='+iopen+'>URLを開く</a>').click(function(){
					$menu.hide(); win.open( url );
				}))
				.append($('<a><img src=ques20.png>タイトル/アイコンを取得</a>').click(function(){
					$menu.hide();
					var $title = $('<input id=antitle>');
					var $icon = $('<img src=wait.gif class=icon>');
					var $iconurl = $('<input id=anicon readonly>');
					$('#dialog').empty().append(
						$('<table id=analybox></table>').append(
							$('<tr><th>タイトル</th></tr>').append(
								$('<td></td>').append( $title )
							).append(
								$('<th></th>').append(
									$('<a>反映</a>').button().click(function(){
										if( tree.nodeAttr( nid,'title',$title.val() ) >1 )
											$(item).children('.title').text( $title.val() );
									})
								)
							)
						).append(
							$('<tr><th>アイコン</th></tr>').append(
								$('<td></td>').append( $icon ).append( $iconurl )
							).append(
								$('<th></th>').append(
									$('<a>反映</a>').button().click(function(){
										if( tree.nodeAttr( nid,'icon',$iconurl.val() ) >1 )
											$(item)
											.children('.icon').attr('src',$icon.attr('src')).end()
											.children('.iconurl').text( $iconurl.val() );
									})
								)
							)
						).append(
							$('<tr></tr>').append(
								$('<td id=anmove colspan=3></td>').append(
									$('<a title="前のアイテム">&nbsp;&nbsp;▲&nbsp;&nbsp;</a>').button().click(function(){
										var $prev = $(item).prev();
										while( $prev.hasClass('folder') ) $prev = $prev.prev();
										if( $prev.hasClass('item') ) shiftTo( item=$prev[0] );
									})
								).append(
									$('<a title="次のアイテム">&nbsp;&nbsp;▼&nbsp;&nbsp;</a>').button().click(function(){
										var $next = $(item).next();
										while( $next.hasClass('folder') ) $next = $next.next();
										if( $next.hasClass('item') ) shiftTo( item=$next[0] );
									})
								)
							)
						)
					).dialog({
						title	:'タイトル/アイコンを取得'
						,modal	:true
						,width	:560
						,height	:217
						,close	:function(){ $(this).dialog('destroy'); }
					});
					analyze();
					function analyze(){
						var url = $(item).children('.url').text();
						$.ajax({
							type:'post'
							,url:':analyze'
							,data:url+'\r\n'
							,error:function(){
								if( url==$(item).children('.url').text() ){
									$title.val('');
									$icon.attr('src','item.png');
									$iconurl.val('');
								}
							}
							,success:function(data){
								data = data[0];
								if( url==$(item).children('.url').text() ){
									$title.val( HTMLdec( data.title ||'' ) );
									$icon.attr('src',data.icon ||'item.png');
									$iconurl.val( data.icon ||'' );
								}
							}
						});
					}
					function shiftTo( item ){
						nid = item.id.slice(4);	// ノードID
						setTimeout(function(){ $(item).mousedown(); },0);
						setTimeout(function(){
							$(item).mouseup();
							$title.val('');
							$icon.attr('src','wait.gif');
							$iconurl.val('');
							analyze(item);
						},1);
					}
				}));
			}
		}
	}
	/*
	$box.append($('<a><img src=xxx.png>一括でタイトル/URLを変更</a>').click(function(){
		// TODO:まめFileと同じような機能
		var $tabs = $('#batchtabs');
		if( !$tabs.hasClass('ui-tabs') ){
			// 初回実行時
			$('#batchUrl').html( $('#batchTitle').html() );
			$('#batchIUrl').html( $('#batchTitle').html() );
			$tabs.tabs();
		}
		// ダイアログリサイズ
		var resize = function(){
			var timer = null;
			return function(){ clearTimeout( timer ); timer = setTimeout( resizer ,20 ); };
		}();
		var $itembox = $('.batchItem td.before div, .batchItem td.after div');
		var $batch = $('#batch').dialog({
			title		:'一括でタイトル/URLを変更'
			,modal		:true
			,width		:$(win).width() * 0.8
			,height		:$(win).height() * 0.7
			,close		:close
			,resize		:resize
			,minWidth	:400
			,buttons:{
				'　実　行　':function(){}
				,'キャンセル':close
			}
		});
		// ボタン上部の罫線を消す
		for( var $e=$batch.next(); $e.length; $e=$e.next() ){
			if( $e.hasClass('ui-dialog-buttonpane') ) $e.css({
				border:'none','margin-top':0,'padding-top':0
			});
		}
		// アイテム登録
		var $titles0 = $('#batchTitle td.before div').empty();
		var $titles1 = $('#batchTitle td.after div').empty();
		var $urls0 = $('#batchUrl td.before div').empty();
		var $urls1 = $('#batchUrl td.after div').empty();
		var $iurls0 = $('#batchIUrl td.before div').empty();
		var $iurls1 = $('#batchIUrl td.after div').empty();
		var $item0 = $('<i><img><input readonly></i>');
		var $item1 = $('<i><img><input></i>');
		var items = doc.getElementById('items').children;
		var length = items.length;
		var index = 0;
		var folder = 0;
		var timer = null;
		var lister = function(){
			var count = busyLoopCount;
			while( index < length && count >0 ){
				var item = items[index];
				if( $(item).hasClass('select') ){
					var node = tree.node( item.id.slice(4) );
					if( node ){
						if( node.child ){
							if( folder++ % 2 ){
								$item0.addClass('color');
								$item1.addClass('color');
							}
							else{
								$item0.removeClass('color');
								$item1.removeClass('color');
							}
							$item0.children('img').attr('src','folder.png');
							$item1.children('img').attr('src','folder.png');
							$titles0.append($item0.clone().children('input').val( node.title ).end());
							$titles1.append($item1.clone().children('input').val( node.title ).end());
						}
						else{
							var icon = node.icon ? node.icon : 'item.png';
							$item0.children('img').attr('src',icon);
							$item1.children('img').attr('src',icon);
							if( index % 2 ){
								$item0.addClass('color');
								$item1.addClass('color');
							}
							else{
								$item0.removeClass('color');
								$item1.removeClass('color');
							}
							$titles0.append($item0.clone().children('input').val( node.title ).end());
							$titles1.append($item1.clone().children('input').val( node.title ).end());
							$urls0.append($item0.clone().children('input').val( node.url ).end());
							$urls1.append($item1.clone().children('input').val( node.url ).end());
							$iurls0.append($item0.clone().children('input').val( node.icon ).end());
							$iurls1.append($item1.clone().children('input').val( node.icon ).end());
						}
					}
				}
				index++; count--;
			}
			if( index < length ) timer = setTimeout(lister,0);
		};
		var resizer = function(){
			var h = $batch.height() -5;
			$tabs.height( h ).children('div').height( h -65 );
			$itembox.height( h - 242 );
		};
		var close = function(){
			clearTimeout( timer );
			$item0.remove();
			$item1.remove();
			$batch.dialog('destroy');
		};
		resizer();
		lister();
	}));
	*/
	if( itemList('?')=='child' ){
		$box.append('<hr>');
		if( isLocalServer ){
			if( width<250 ) width=250;
			$box.append($('<a><img src=newitem.png>クリップボードのURLを新規登録</a>').click(function(){
				$menu.hide();
				// 選択アイテム位置に登録
				var pnode = tree.nodeParent( nid );
				for( var index=pnode.child.length; index--; ){
					if( pnode.child[index].id==nid ) break;
				}
				clipboardTo( pnode ,index ,function( nodes ){
					var eachChild = function(){
						// アイテム欄内でDOM作成ループがおわるたびに
						for( var i=nodes.length; i--; ){
							// 新アイテム要素発見したら選択状態にして配列から除外
							var item = doc.getElementById('item'+ nodes[i].id );
							if( item ){
								// 先頭アイテムだけCtrlキー押下クリック(遅い)、それ以外は速いaddClass
								if( i==0 ) $(item).trigger('selfclick',[false,true]);
								else $(item).addClass('select');
								nodes.splice(i,1);
							}
							else break;
						}
					};
					itemList(
						 tree.node( selectFolder.id.slice(6) )
						,{ scrollTop:doc.getElementById('itembox').scrollTop ,eachChild:eachChild }
					);
				});
			}));
		}
		$box.append($('<a><img src=newfolder.png>新規フォルダ作成</a>').click(function(){
			$menu.hide();
			// 選択アイテム位置に新規フォルダ
			var pnode = tree.nodeParent( nid );
			for( var index=pnode.child.length; index--; ){
				if( pnode.child[index].id==nid ) break;
			}
			var node = tree.newFolder( '' ,pnode ,index );
			// フォルダツリー更新
			var $item = [];
			folderTree({
				 clickID:selectFolder.id.slice(6)
				,itemOption:{
					 scrollTop:doc.getElementById('itembox').scrollTop
					,eachChild:function(){
						// 新フォルダ選択
						// TODO:アイテム欄内フォルダ展開してると画面チカチカするレベル
						if( !$item.length ){
							$item = $('#item'+ node.id ).trigger('selfclick');
						}
						if( $item.length && !name.length ){
							// 名前変更・テキスト選択
							edit( $item.children('.title')[0] ,{ select:true });
						}
					}
				}
			});
		}));
	}
	if( !$box.children().last().is('hr') ) $box.append('<hr>');
	if( $(item).hasClass('folder') ){
		$box.append($('<a><img src=skull.png>リンク切れ調査(フォルダ)</a>').click(function(){
			$menu.hide(); itemList('deads','folder');
		}));
	}
	else{
		if( url.length && !itemList('deadsRunning?') ){
			$box.append($('<a><img src=skull.png>リンク切れ調査</a>').click(function(){
				$menu.hide(); itemList('poke');
			}));
		}
		var $status = $(item).children('.status');
		if( $status.length ){
			$box.append($('<a><img src=check.png>おなじ種類をすべて選択</a>').click(function(){
				$menu.hide();
				var ico = $(item).children('.status').children('.icon').attr('src');
				for( var items=doc.getElementById('items').children ,i=items.length; i--; ){
					var $item = $(items[i]);
					if( $item.children('.status').children('.icon').attr('src')==ico )
						$item.addClass('select');
					else
						$item.removeClass('select');
				}
			}));
			if( $status.text().match(/≫.+/) ){
				$box.append($('<a><img src=pen.png>転送先URLに書き換え</a>').click(function(){
					$menu.hide();
					for( var items=doc.getElementById('items').children ,i=items.length; i--; ){
						var $item = $(items[i]);
						if( $item.hasClass('select') ){
							var newurl = $item.children('.status').text().match(/≫.+/);
							if( newurl ){
								newurl = newurl[0].replace(/≫/,'');
								if( tree.nodeAttr( items[i].id.slice(4),'url',newurl ) >1 )
									$item.children('.url').text( newurl );
							}
						}
					}
				}));
			}
		}
		if( itemList('?')=='deads' ){
			$box.append($('<a><img src=minus.png>一覧から除外</a>').click(function(){
				$menu.hide();
				for( var items=doc.getElementById('items').children ,i=items.length; i--; ){
					var $item = $(items[i]);
					if( $item.hasClass('select') ) $item.remove();
				}
			}));
		}
	}
	if( !$box.children().last().is('hr') ) $box.append('<hr>');
	// 削除
	var idelete = tree.trashHas( nid )? 'delete.png' :'trash.png';
	$box.append($('<a><img src='+idelete+'>削除</a>').click(function(){
		$menu.hide(); $('#delete').click();
	}));
	// 表示
	$menu.width(width).css({
		left: (($(win).width() -ev.pageX) < $menu.width())? ev.pageX -$menu.width() : ev.pageX
		,top: (($(win).height() -ev.pageY) < $menu.height())? ev.pageY -$menu.height() : ev.pageY
	}).show();
	return false;	// 既定右クリックメニュー出さない
}
// TODO:左ボタンドラッグと右ボタンドラッグを区別していないので、右ドラッグした時に
// たまたまカーソル下に要素があればコンテキストメニューが出て、なければ出ないという
// 挙動になる。右ドラッグ用メニュー「ここに移動」「ここにコピー」などを作るべき？
var onContextHide = null; // #contextmenu.hide()時に実行する関数
function folderContextMenu(ev){
	var folder = ev.target;
	while( !$(folder).hasClass('folder') ){
		if( !folder.parentNode ) return;
		folder = folder.parentNode;
	}
	var nid = folder.id.slice(6); // ノードID
	var $menu = $('#contextmenu');
	var $box = $menu.children('div').empty();
	var width = 210;
	if( isLocalServer ){
		if( width<250 ) width=250;
		$box.append($('<a><img src=newitem.png>クリップボードのURLを新規登録</a>').click(function(){
			$menu.hide(); onContextHide();
			// クリックフォルダ先頭に登録
			var pnode = tree.node( nid );
			clipboardTo( pnode ,0 ,function( nodes ){
				var eachChild = function(){
					// アイテム欄内でDOM作成ループがおわるたびに
					for( var i=nodes.length; i--; ){
						// 新アイテム要素発見したら選択状態にして配列から除外
						var item = doc.getElementById('item'+ nodes[i].id );
						if( item ){
							// 先頭アイテムだけCtrlキー押下クリック(遅い)、それ以外は速いaddClass
							if( i==0 ) $(item).trigger('selfclick',[false,true]);
							else $(item).addClass('select');
							nodes.splice(i,1);
						}
						else break;
					}
				};
				$('#folder'+pnode.id).removeClass('select').trigger('click',{ eachChild:eachChild });
			});
		}));
	}
	$box.append($('<a><img src=newfolder.png>新規フォルダ作成</a>').click(function(){
		$menu.hide(); onContextHide();
		// クリックフォルダ先頭に
		var node = tree.newFolder( '', nid );
		// フォルダツリー生成
		function titleEdit(){ edit( $('#folder'+node.id).find('.title')[0] ,{select:true} ); }
		if( itemList('?')=='child' && folder===selectFolder ){
			folderTree({ clickID:nid ,done:titleEdit });
		}
		else{
			folderTree({
				 selectID: selectFolder.id.slice(6)
				,inactive: $(selectFolder).hasClass('inactive')
				,done	 : titleEdit
			});
		}
	}))
	.append('<hr>').append($('<a><img src=skull.png>リンク切れ調査(フォルダ)</a>').click(function(){
		$menu.hide(); onContextHide();
		itemList('deads',tree.node( nid ));
	}));
	if( nid==tree.trash().id ){
		$box.append('<hr>').append($('<a><img src=delete.png>ごみ箱を空にする</a>').click(function(){
			$menu.hide(); onContextHide();
			Confirm({
				width:420 ,height:180
				,msg:'!ごみ箱の全アイテム・フォルダを完全に消去します。'
				,ok:function(){
					var sid = selectFolder.id.slice(6);
					var selectTrash = tree.trashHas( sid );
					tree.trashEmpty();
					switch( itemList('?') ){
					case 'finds':
					case 'deads':
						folderTree({
							 selectID: selectTrash? tree.top().id :sid
							,inactive: $(selectFolder).hasClass('inactive')
						});
						// アイテム欄で既に存在しないものを消去
						for( var items=doc.getElementById('items').children ,i=items.length; i--; ){
							if( !tree.node(items[i].id.slice(4)) ) $(items[i]).remove();
						}
						break;
					case 'child':
						if( selectTrash ) folderTree({ click0:true });
						else folderTree({ selectID:sid ,inactive:$(selectFolder).hasClass('inactive') });
						break;
					}
				}
			});
		}));
	}
	else if( tree.movable(nid) ){
		$box.append('<hr>');
		if( tree.trashHas(nid) ){
			$box.append($('<a><img src=delete.png>削除</a>').click(function(){
				$menu.hide(); onContextHide();
				Confirm({
					width:400 ,height:200
					,msg:'!フォルダ「' +$('.title',folder).text() +'」を完全に消去します。'
					,ok:function(){
						var sid = selectFolder.id.slice(6);
						var pid = tree.nodeParent( nid ).id;
						tree.eraseNode( nid );
						switch( itemList('?') ){
						case 'finds':
						case 'deads':
							folderTree({
								 selectID: tree.node(sid)? sid :tree.top().id
								,inactive: $(selectFolder).hasClass('inactive')
							});
							// アイテム欄で既に存在しないものを消去
							for( var items=doc.getElementById('items').children ,i=items.length; i--; ){
								if( !tree.node(items[i].id.slice(4)) ) $(items[i]).remove();
							}
							break;
						case 'child':
							folderTree({ clickID: tree.node(sid) ? sid :pid });
							break;
						}
					}
				});
			}));
		}
		else{
			$box.append($('<a><img src=trash.png>削除</a>').click(function(){
				$menu.hide(); onContextHide();
				var sid = selectFolder.id.slice(6);
				switch( itemList('?') ){
				case 'finds':
				case 'deads':
					tree.moveChild( [nid], tree.trash() );
					folderTree({ selectID:sid ,inactive:$(selectFolder).hasClass('inactive') });
					break;
				case 'child':
					var isChild = false; // 選択フォルダの子フォルダを削除
					var child = tree.node(sid).child;
					for( var i=child.length; i--; ){
						if( child[i].id==nid ){ isChild = true; break; }
					}
					tree.moveChild( [nid], tree.trash() );
					if( isChild ) folderTree({ clickID:sid });
					else folderTree({ selectID:sid ,inactive:$(selectFolder).hasClass('inactive') });
					break;
				}
			}));
		}
	}
	// ターゲットフォルダ色つけ
	$(folder).addClass('contexted');
	onContextHide = function(){
		$(folder).removeClass('contexted');
		onContextHide = null;
	};
	// 表示
	$menu.width(width).css({
		left: (($(win).width() -ev.pageX) < $menu.width())? ev.pageX -$menu.width() : ev.pageX
		,top: (($(win).height() -ev.pageY) < $menu.height())? ev.pageY -$menu.height() : ev.pageY
	}).show();
	return false;	// 既定右クリックメニュー出さない
}
function folderKeyDown(ev){
	switch( ev.which || ev.keyCode || ev.charCode ){
	case 38: // ↑
		$(this).prev().trigger('selfclick');
		return false;
	case 40: // ↓
		$(this).next().trigger('selfclick');
		return false;
	case 46: // Delete
		$('#delete').click();
		return false;
	case 113: // F2
		edit( $(this).find('.title')[0] );
		return false;
	}
}
function itemKeyDown(ev){
	switch( ev.which || ev.keyCode || ev.charCode ){
	case 38: // ↑
		$(this).prev().trigger('selfclick', [ev.shiftKey]);
		return false;
	case 40: // ↓
		$(this).next().trigger('selfclick', [ev.shiftKey]);
		return false;
	case 46: // Delete
		$('#delete').click();
		return false;
	case 113: // F2
		edit( $(this).find('.title')[0] );
		return false;
	}
}
function itemKeyPress(ev){
	switch( ev.which || ev.keyCode || ev.charCode ){
	case 13: // Enter
		$(this).dblclick();
		return false;
	}
}
function selectItemClear(){
	for( var items=doc.getElementById('items').children ,i=items.length; i--; ){
		$(items[i]).removeClass('select').removeClass('inactive');
	}
	selectItemLast = null;
}
// TODO:Firefoxのブックマーク管理画面みたいに右下に編集画面があるタイプのが使いやすいかな？
function edit( element, opt ){
	var $editbox = $('#editbox');
	var fontWeight = 'normal';
	var indent = 0;
	if( element ){
		switch( element.className ){
		case 'title':
			fontWeight = 'bold';
			indent = parseInt( element.style.textIndent||0 );
		case 'url':
		case 'iconurl':
			// element全体見えるようスクロール
			//viewScroll( element );
			// スクロールが発生した場合にscrollイベントが発生するが、ここで編集ボックス表示した後に
			// scrollイベント発生するようで、そこで編集ボックスを消しているので、消えてしまう。
			//		スクロール→編集ボックス表示→scrollイベントで編集ボックス消え
			// 回避のためsetTimeoutで実行して、ここの処理より先にscrollイベントを発生させる。
			//		スクロール→scrollイベントで編集ボックス消え→編集ボックス表示
			//setTimeout(function(){
				var $e = $(element);
				var offset = $e.offset();
				var isFolderTree = (element.parentNode.id.indexOf('folder')==0)? true:false;
				$editbox.css({
					left			:offset.left +indent -1
					,top			:offset.top -1
					,width			:(isFolderTree? $('#folders').width() -element.offsetLeft : element.offsetWidth -1) -indent
					,'padding-left'	:$e.css('padding-left')
					,'font-weight'	:fontWeight
				})
				.val( $e.text() )
				.on({
					// 変更反映
					blur:function(){
						// ノードツリー反映
						var nid = element.parentNode.id.replace(/^\D*/,'');
						var attrName = (element.className=='iconurl')? 'icon' : element.className;
						var value = $(this).val();
						if( tree.nodeAttr( nid, attrName, value ) >1 ){
							// 成功、DOM反映
							$e.text( value );
							switch( attrName ){
							case 'title':
								// TODO:スクロールが初期化されてしまうフォルダツリー欄の表示状態維持すべき
								var $item = $(element.parentNode);
								if( $item.hasClass('item') ){
									$e.attr('title', value );
									if( $item.hasClass('folder') ){
										// アイテム欄のフォルダの時フォルダツリーも更新
										folderTree({ selectID:selectFolder.id.slice(6) ,inactive:true });
									}
								}
								else if( $item.hasClass('folder') ){
									// フォルダツリーで
									var pnode = tree.nodeParent(nid);
									if( itemList('?')=='child' && selectFolder.id.slice(6)==pnode.id ){
										// アイテム欄が親フォルダを表示していた場合アイテム欄を更新
										//itemList( pnode );
										alert('TODO:これはどんな操作で発生するんだったか…？発生しないような…？');
									}
								}
								break;
							case 'url':
								if( value.length ){
									// 新品アイテムはURL取得解析する
									var node = tree.node( nid );
									if( node.title=='新規ブックマーク' ){
										tree.modifing(true);
										$.ajax({
											type:'post'
											,url:':analyze'
											,data:value+'\r\n'
											,success:function(data){
												data = data[0];
												if( data.title.length && node.title=='新規ブックマーク' ){
													data.title = HTMLdec( data.title );
													if( tree.nodeAttr( nid,'title',data.title ) >1 )
														$('#item'+nid).find('.title').text( data.title ).attr('title',data.title);
												}
												if( data.icon.length && (!node.icon|| !node.icon.length) ){
													if( tree.nodeAttr( nid,'icon',data.icon ) >1 ){
														$('#item'+nid)
														.find('.icon').attr('src',data.icon).end()
														.find('.iconurl').text( data.icon );
													}
												}
											}
											,complete:function(){ tree.modifing(false); }
										});
									}
								}
								break;
							case 'icon':
								$('#item'+nid).find('.icon').attr('src',(value.length?value:'item.png'));
								break;
							}
							// フォルダツリーの場合は#foldersの幅を設定する。
							// しないと横スクロールバーがある時に、<div class=folder>の幅(width)が
							// #folderboxの幅しかなくなって、選択時の色がうまく反映されず変になる。
							if( isFolderTree ){
								var foldersWidth = $('#folders').width();
								var needWidth = (1.6 * $e.width() + element.offsetLeft)|0;
								if( needWidth > foldersWidth ) $('#folders').width( needWidth );
							}
						}
						// 完了フォーカス戻し
						$(this).off().hide(); $e.trigger('selfclick');
					}
					// TAB,Enterで反映
					,keydown:function(ev){
						switch( ev.which || ev.keyCode || ev.charCode ){
						case 9: $(this).blur(); return false; // TAB
						}
					}
					,keypress:function(ev){
						switch( ev.which || ev.keyCode || ev.charCode ){
						case 13: $(this).blur(); return false; // Enter
						}
					}
				}).show().focus();
				if( opt && opt.select ) $editbox.select();
			//},10);
			break;
		case 'status':
		case 'place':
		case 'date':
			// 場所/作成日時は変更禁止、値コピーのためボックス表示。
			//setTimeout(function(){
				var $e = $(element);
				var offset = $e.offset();
				$editbox.css({
					left			:offset.left -1
					,top			:offset.top -1
					,width			:element.offsetWidth -1
					,'padding-left'	:$e.css('padding-left')
					,'font-weight'	:fontWeight
				})
				.val( $e.text() )
				.on({
					blur:function(){
						// なにもせずフォーカス戻し
						$(this).off().hide(); $e.trigger('selfclick');
					}
					,keydown:function(ev){
						switch( ev.which || ev.keyCode || ev.charCode ){
						case 9: $(this).blur(); return false; // TAB
						}
					}
					,keypress:function(ev){
						switch( ev.which || ev.keyCode || ev.charCode ){
						case 13: $(this).blur(); return false; // Enter
						}
					}
				}).show().focus();
			//},10);
			break;
		}
	}
	return $editbox;
}
// element全体見えるようスクロール
/*
function viewScroll( element ){
	// スクロール対象ボックス確認
	var boxid = element.parentNode.id;
	if( boxid.indexOf('item')==0 ) boxid = 'itembox';
	else if( boxid.indexOf('folder')==0 ) boxid = 'folderbox';
	else return;
	var box = doc.getElementById( boxid );
	// 要素の相対座標
	var pos = $(element).position();
	pos.right = pos.left + element.offsetWidth;
	pos.bottom = pos.top + element.offsetHeight;
	// 左が見えない
	if( pos.left <=23 )
		box.scrollLeft += pos.left -23 -5;
	// 上が見えない
	if( pos.top <=30 )
		box.scrollTop += pos.top -30 -5;
	// 右が見えない
	if( pos.right >= box.clientWidth )
		box.scrollLeft += pos.right - box.clientWidth +5;
	// 下が見えない
	if( pos.bottom >= box.clientHeight )
		box.scrollTop += pos.bottom - box.clientHeight +5;
}
*/
// クリップボードのURLを新規登録
// pnode: 登録先フォルダノード
// index: 登録位置インデックス
// after: 処理完了後コールバック
function clipboardTo( pnode ,index ,after ){
	$('#dialog').empty().text('処理中です...').dialog({
		title	:'情報'
		,width	:300
		,height	:100
	});
	$.ajax({
		url:':clipboard.txt'
		,error:function(){ $('#dialog').dialog('destroy'); }
		,success:function(data){
			$('#dialog').dialog('destroy');
			var lines = data.split(/[\r\n]+/);				// 行分割
			var regTrim = /^\s+|\s+$/g;
			var regUrl = /^[A-Za-z]+:.+/;
			var url = '';
			var ajaxs = [];									// ajax配列
			var nodes = [];									// 作成したノード配列
			var complete = 0;								// 完了数カウント
			tree.modifing(true);							// 編集中表示
			var itemAdd = function( url ,title ){
				// ノード作成
				var node = tree.newURL( pnode, url, title || url.noProto(), '', index );
				if( node ){
					nodes.push( node );
					// タイトル/favicon取得
					ajaxs.push($.ajax({
						type:'post'
						,url:':analyze'
						,data:url+'\r\n'
						,success:function(data){
							data = data[0];
							if( !title && data.title.length ){
								data.title = HTMLdec( data.title );
								if( tree.nodeAttr( node.id,'title',data.title ) >1 )
									$('#item'+node.id).find('.title').text( data.title ).attr('title',data.title);
							}
							if( data.icon.length ){
								if( tree.nodeAttr( node.id,'icon',data.icon ) >1 ){
									$('#item'+node.id)
									.find('.icon').attr('src',data.icon).end()
									.find('.iconurl').text( data.icon );
								}
							}
						}
						,complete:function(){ complete++; }
					}));
				}
			};
			for( var i=lines.length; i--; ){				// 最後の行から
				var str = lines[i].replace(regTrim,'');		// 前後の空白削除(trim()はIE8ダメ)
				if( regUrl.test(str) ){						// URL発見
					if( url ) itemAdd( url );
					url = str;
				}
				else if( url ) itemAdd( url ,str ) ,url='';	// タイトル付URL発見
			}
			if( url ) itemAdd( url );
			// ajax完了待ち
			var completed = function(){
				if( complete < ajaxs.length ) setTimeout(completed,250);
				else tree.modifing(false);					// 編集完了
			};
			completed();
			if( after ) after( nodes.reverse() );
		}
	});
}
// 確認ダイアログ
// IE8でなぜか改行コード(\n)の<br>置換(replace)が効かないので、しょうがなく #BR# という
// 独自改行コードを導入。Chrome/Firefoxは単純に \n でうまくいくのにIE8だけまた・・
function Confirm( arg ){
	var opt ={
		title		:arg.title ||'確認'
		,modal		:true
		,resizable	:false
		,width		:390
		,height		:190
		,close		:function(){ $(this).dialog('destroy'); }
		,buttons	:{}
	};
	var ico = '';

	if( arg.ok )  opt.buttons['O K']	= function(){ $(this).dialog('destroy'); arg.ok(); }
	if( arg.yes ) opt.buttons['はい']   = function(){ $(this).dialog('destroy'); arg.yes(); }
	if( arg.no )  opt.buttons['いいえ'] = function(){ $(this).dialog('destroy'); arg.no(); }
	opt.buttons['キャンセル'] = function(){ $(this).dialog('destroy'); }

	if( arg.width ){
		var maxWidth = $(win).width() -100;
		if( arg.width > maxWidth ) arg.width = maxWidth;
		else if( arg.width < 300 ) arg.width = 300;
		opt.width = arg.width;
	}
	if( arg.height ){
		var maxHeight = $(win).height() -100;
		if( arg.height > maxHeight ) arg.height = maxHeight;
		else if( arg.height < 150 ) arg.height = 150;
		opt.height = arg.height;
	}
	if( arg.resize ) opt.resizable = true;
	switch( arg.msg[0] ){
	case 'i': ico = 'info20.png'; arg.msg = arg.msg.slice(1); break;
	case '?': ico = 'ques20.png'; arg.msg = arg.msg.slice(1); break;
	case '!': ico = 'warn20.png'; arg.msg = arg.msg.slice(1); break;
	}
	ico = ico.length ? '<div class=msg style="background:url('+ico+') no-repeat;padding:0 0 0 30px;">':'<div class=msg>';

	$('#dialog').html( ico +HTMLenc( arg.msg ).replace(/#BR#/g,'<br>') +'</div>').append( arg.$e ).dialog( opt );
}
// TODO:アイコンつける(x,!とか)
function Alert( msg ){
	var opt ={
		title		:'通知'
		,modal		:true
		,width		:360
		,height		:165
		,close		:function(){ $(this).dialog('destroy'); }
		,buttons	:{ 'O K':function(){ $(this).dialog('destroy'); } }
	};
	$('#dialog').html( HTMLenc( msg ).replace(/#BR#/g,'<br>') ).dialog( opt );
}
// ふわっと表示して徐々に消えるメッセージ
// http://jsdo.it/honda0510/bELN
// IE8のメイリオだとfadeIn/fadeOutでアンチエイリアスが効かず汚いためゴシックに変更する
// http://blog.tackikaku.jp/2010/11/ie78opacity.html
if( IE && IE<9 ) $('#notify').addClass('nomeiryo');
// TODO:IE8でfadeIn動作にチラツキが発生。IE7では問題なし。IE8固有問題か？
function Notify( msg ){
	var $em = $('#notify').html( HTMLenc( msg ).replace(/#BR#/g,'<br>') );
	$em.css({
		left:$(win).width()/2 - $em.outerWidth()/2
		,top:$(win).height()/2 - $em.outerHeight()/2
	})
	.fadeIn(400).delay(999).fadeOut(600);
}
// HTMLエンコード
function HTMLenc( html ){
	var $a = $('<a/>');
	var enc = $a.text(html).html();
	$a.remove();
	return enc;
}
// HTMLデコード
function HTMLdec( html ){
	var $a = $('<a/>');
	var dec = $a.html(
		html.replace(/[<>]/g,function(m){
			return { '<':'&lt;', '>':'&gt;' }[m];
		})
	).text();
	$a.remove();
	return dec;
}
// index.js参照
String.prototype.noProto = function(){ return this.replace(/^https?:\/\//,''); };
String.prototype.myNormal = function(){
	// 変換用キャッシュ
	var reg2 = /ｶﾞ|ｷﾞ|ｸﾞ|ｹﾞ|ｺﾞ|ｻﾞ|ｼﾞ|ｽﾞ|ｾﾞ|ｿﾞ|ﾀﾞ|ﾁﾞ|ﾂﾞ|ﾃﾞ|ﾄﾞ|ﾊﾞ|ﾋﾞ|ﾌﾞ|ﾍﾞ|ﾎﾞ|ﾊﾟ|ﾋﾟ|ﾌﾟ|ﾍﾟ|ﾎﾟ/g;
	var reg1 = /[ぁぃぅぇぉゃゅょっァィゥェォャュョッヵｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜｦﾝｧｨｩｪｫｬｭｮｯ､｡ｰ｢｣ﾞﾟ]/g;
	var map = {
			// ひらがな小→大
			'ぁ':'あ', 'ぃ':'い', 'ぅ':'う', 'ぇ':'え', 'ぉ':'お',
			'ゃ':'や', 'ゅ':'ゆ', 'ょ':'よ', 'っ':'つ',
			// 全角カナ小→大
			'ァ':'ア', 'ィ':'イ', 'ゥ':'ウ', 'ェ':'エ', 'ォ':'オ',
			'ャ':'ヤ', 'ュ':'ユ', 'ョ':'ヨ', 'ッ':'ツ', 'ヵ':'カ',
			// 半角カナ→全角カナ
			'ｱ':'ア', 'ｲ':'イ', 'ｳ':'ウ', 'ｴ':'エ', 'ｵ':'オ',
			'ｶ':'カ', 'ｷ':'キ', 'ｸ':'ク', 'ｹ':'ケ', 'ｺ':'コ',
			'ｻ':'サ', 'ｼ':'シ', 'ｽ':'ス', 'ｾ':'セ', 'ｿ':'ソ',
			'ﾀ':'タ', 'ﾁ':'チ', 'ﾂ':'ツ', 'ﾃ':'テ', 'ﾄ':'ト',
			'ﾅ':'ナ', 'ﾆ':'ニ', 'ﾇ':'ヌ', 'ﾈ':'ネ', 'ﾉ':'ノ',
			'ﾊ':'ハ', 'ﾋ':'ヒ', 'ﾌ':'フ', 'ﾍ':'ヘ', 'ﾎ':'ホ',
			'ﾏ':'マ', 'ﾐ':'ミ', 'ﾑ':'ム', 'ﾒ':'メ', 'ﾓ':'モ',
			'ﾔ':'ヤ', 'ﾕ':'ユ', 'ﾖ':'ヨ',
			'ﾗ':'ラ', 'ﾘ':'リ', 'ﾙ':'ル', 'ﾚ':'レ', 'ﾛ':'ロ',
			'ﾜ':'ワ', 'ｦ':'ヲ', 'ﾝ':'ン',
			'ｶﾞ':'ガ', 'ｷﾞ':'ギ', 'ｸﾞ':'グ', 'ｹﾞ':'ゲ', 'ｺﾞ':'ゴ',
			'ｻﾞ':'ザ', 'ｼﾞ':'ジ', 'ｽﾞ':'ズ', 'ｾﾞ':'ゼ', 'ｿﾞ':'ゾ',
			'ﾀﾞ':'ダ', 'ﾁﾞ':'ヂ', 'ﾂﾞ':'ヅ', 'ﾃﾞ':'デ', 'ﾄﾞ':'ド',
			'ﾊﾞ':'バ', 'ﾋﾞ':'ビ', 'ﾌﾞ':'ブ', 'ﾍﾞ':'ベ', 'ﾎﾞ':'ボ',
			'ﾊﾟ':'パ', 'ﾋﾟ':'ピ', 'ﾌﾟ':'プ', 'ﾍﾟ':'ペ', 'ﾎﾟ':'ポ',
			'ｧ':'ア', 'ｨ':'イ', 'ｩ':'ウ', 'ｪ':'エ', 'ｫ':'オ',		// 小→大
			'ｬ':'ヤ', 'ｭ':'ユ', 'ｮ':'ヨ', 'ｯ':'ツ',					// 小→大
			'､':'、', '｡':'。', 'ｰ':'ー', '｢':'「', '｣':'」'
	};
	return function(){
		return this.replace(/[！-～]/g,function(m){
			return String.fromCharCode( m.charCodeAt(0) -0xFEE0 );	// 英数全角→半角
		})
		.replace(reg2,function(m){ return map[m]; })				// 先に文字列を1文字に変換(半角カナ濁音)
		.replace(reg1,function(m){ return map[m]; })				// 1文字→1文字
		.toUpperCase();												// 英数小→大
	};
}();

})( $, window, document, Object.prototype.toString, window.ActiveXObject? document.documentMode:0 );
