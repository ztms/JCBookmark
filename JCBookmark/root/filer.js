// vim:set ts=4:vim modeline
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
	beforeSend:function(xhr){
		xhr.setRequestHeader('If-Modified-Since','Thu, 01 Jun 1970 00:00:00 GMT');
	}
});
var isLocalServer = true;		// ローカルHTTPサーバー(通常)
var select = null;				// 選択フォルダorアイテム
var selectFolder = null;		// 選択フォルダ
var selectItemLast = null;		// 最後に単選択(通常クリックおよびCtrl+クリック)したアイテム
var draggie = null;				// ドラッグしている要素
var dragItem = {};				// 複数選択ドラッグ情報
var tree = {
	// ルートノード
	root:null
	// 変更されてるかどうか
	,_modified:false
	,modified:function( on ){
		if( arguments.length ){
			if( on && !tree._modified ){
				$('#modified').show();
				$(doc.body).css('padding-top',22);
				resizeV(22);
			}
			tree._modified = on;
			return tree;
		}
		return tree._modified;
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
				for( var i=node.child.length-1; i>=0; i-- ){
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
	,newFolder:function( title, pid ){
		var node = {
			id			:tree.root.nextid++
			,dateAdded	:(new Date()).getTime()
			,title		:title || '新規フォルダ'
			,child		:[]
		};
		// 指定ノードのchild先頭に追加する
		( ( pid && tree.node(pid) ) || tree.top() ).child.unshift( node );
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
		if( !pnode || !pnode.child ){
			pnode = tree.top();
			index = 0;
		}
		else if( !index ) index = 0;
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
	// ids:ノードID配列、dst:フォルダノードIDまたはノードオブジェクト
	,moveChild:function( ids, dst ){
		if( oStr.call(dst)==='[object String]' ) dst = tree.node( dst );
		if( dst && dst.child ){
			// 移動元ノード検査：移動元と移動先が同じ、移動不可ノード、移動元の子孫に移動先が存在したら除外
			for( var i=ids.length-1; i>=0; i-- ){
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
					//for( var i=0; i<clipboard.length; i++ ) dst.child.push( clipboard[i] ); // 末尾に
					for( var i=clipboard.length-1; i>=0; i-- ) dst.child.unshift( clipboard[i] ); // 先頭に
					tree.modified(true);
				}
			}
		}
	}
	// ノード移動(前後に):既定は前に移動、第三引数がtrueなら後に移動
	// ids:ノードID配列、dstid:ノードID、isAfter:boolean
	,moveSibling:function( ids, dstid, isAfter ){
		// 移動元ノード検査：移動元と移動先が同じ、移動不可ノード、移動元の子孫に移動先が存在したら除外
		for( var i=ids.length-1; i>=0; i-- ){
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
									for( var j=movenodes.length-1; j>=0; j-- )
										dstParent.child.splice(i,0, movenodes[j]);
								}
							}else{
								// 前に挿入(逆順に１つずつ)
								for( var j=movenodes.length-1; j>=0; j-- )
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
	var option_ok = false;
	var tree_ok = false;
	option.load(function(){
		// 準備
		var fontSize = (option.font.css()==='gothic.css')? 13 : 12;
		$.css.add('#toolbar input, #folders span, #itemhead span, #items span, #dragbox, #editbox{font-size:'+fontSize+'px;}');
		$('#fontcss').attr('href',option.font.css());
		resize.call( doc );	// 初期化のためwindowオブジェクトでない引数とりあえずdocument渡しておく
		$('body').css('visibility','visible');
		// ツリー描画
		option_ok=true; if( tree_ok ) folderTree({ click0:true });
	});
	tree.load(function(){ tree_ok=true; if( option_ok ) folderTree({ click0:true }); });
	$.ajax({ url:':clipboard.txt' ,error:function(xhr){ if( xhr.status==403 ) isLocalServer=false; } });
})();
// CSSルール追加
// http://d.hatena.ne.jp/ofk/20090716/1247719727 +$.browserを使わない +IE7fix
$.css.add = function( rule ,index ){
	var sheet = $.css.sheet;
	if( !sheet ){
		if('createStyleSheet' in document) sheet = document.createStyleSheet();
		else{
			sheet = document.createElement('style');
			sheet.appendChild( document.createTextNode('') );
			document.documentElement.appendChild( sheet );
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
//   click0		: true/false 最初のフォルダをクリックするかどうか
//   clickID	: クリックするフォルダノードID文字列
//   clickAfter	: クリック完了後に実行するfunction
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
			for( var i=child.length-1; i>=0; i-- ) if( child[i].child ) return true;
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
			var close = {};
			for( var i=subs.length-1; i>=0; i-- ){
				close[subs[i].parentNode.id.slice(6)] = /plus.png$/.test(subs[i].src);
			}
			return function( node ){
				if( node===false ){ $e.remove(); $sub.remove(); return; }
				$icon.attr('src',node.icon);
				$title.text( node.title );
				var $f = $e.clone(true).attr('id','folder'+node.id);
				if( node.sub ){
					var $s = $sub.clone();
					if( close[node.id] ) $s.attr('src','plus.png');
					$f.prepend( $s ).css('padding-left', node.depth *16 );
				}
				else $f.css('padding-left', node.depth *16 +15 );	// +15px <img class=sub> の幅
				return $f;
			};
		}();
		var index = 0;
		var length = folderList.length;
		var maxWidth = 0;
		var hide = false;	// サブツリー非表示フラグ
		var hideDepth = 0;	// サブツリー非表示階層
		$folders.empty();
		(function callee(){
			var count=10;
			while( index < length && count>0 ){
				// DOM生成
				var node = folderList[index];
				var $node = $folder( node ).appendTo( $folders );
				// #folders幅設定(しないと横スクロールバーが必要な時に幅が狭くなり表示崩れる)
				var $title = $node.find('.title');
				var width = $title[0].offsetLeft + (($title.width() *1.6)|0);
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
				// アイテム欄表示オプション
				if( opt.click0 ){
					if( index==0 ) $node.click();
				}
				else if( opt.clickID ){
					if( node.id==opt.clickID ) $node.click();
				}
				// 次
				index++; count--;
			}
			if( index < length ) timer = setTimeout(callee,0);
			else{ $folder(false); if( opt.clickAfter ) opt.clickAfter(); }
		})();
	};
}();
// アイテム欄作成
var itemList = function(){
	var $head = $('#itemhead');
	var $head3 = $head.find('.url').next().next();	// 可変項目ヘッダ(アイコン/場所/調査結果)
	var $itemAppend = null;							// アイテム１つ生成関数
	var kind = 'child';								// アイテム欄の種類
	var keywords = [];								// 検索キーワード
	var timer = null;								// setTimeoutID
	var ajaxer = null;								// ajax発行関数
	var ajaxs = [];									// ajax配列
	var queue = [];									// ajax用ノード配列キュー
	$('#finding').offset($('#keyword').offset()).progressbar();
	function finalize(){
		// タイマー中止
		clearTimeout(timer) ,timer=null;
		// ajax中止
		if( ajaxer ) ajaxer(false), ajaxer=null;
		for( var i=ajaxs.length-1; i>=0; i-- ) ajaxs[i].abort();
		ajaxs.length = queue.length = 0;
		// 検索終了
		$('#itembox').children('.spacer').empty();
		$('#finding').progressbar('value',0);
		$('#findstop').hide();
		$('#find').show();
		// 解放
		if( $itemAppend ) $itemAppend(false) ,$itemAppend=null;
	}
	return function( arg0 ,arg1 ){
		if( arg0==='?' ) return kind;
		finalize();
		if( arg0===false ) return;
		if( arg0==='finds' ){
			// 検索
			if( arg1 ){ // 新規検索
				keywords = $('#keyword').val().split(/[ 　]+/);
				for( var i=keywords.length-1; i>=0; i-- ){
					if( keywords[i].length<=0 ) keywords.splice(i,1);
					else keywords[i] = keywords[i].myNormal();
				}
			}
			if( keywords.length<=0 ) return;
			kind = 'finds';
			$('#deadinfo').trigger('dying').remove();
			$head3.removeClass('iconurl').removeClass('status').addClass('place').text('場所');
			$('#itembox').children('.spacer').html('<img src=wait.gif>');
			$('#find').hide();
			$('#findstop').off().click(function(){ finalize(); }).show();
			var items = doc.getElementById('items');
			$itemAppend = function(){
				var $icon = $('<img class=icon>');
				var $title = $('<span class=title></span>').width( $head.find('.title').width() -18 );
				var $url = $('<span class=url></span>').width( $head.find('.url').width() +4 );
				var $place = $('<span class=place></span>').width( $head3.width() +4 );
				var $date = $('<span class=date></span>').width( $head.find('.date').width() +2 );
				var $item = $('<div class=item tabindex=0></div>')
					.append($icon).append($title).append($url).append($place).append($date)
					.append('<br class=clear>')
					.on('mouseleave',itemMouseLeave);
				var date = new Date();
				var index = 0;
				return function( node, now, place ){
					if( node===false ){ $item.remove(); return; }
					date.setTime( node.dateAdded ||0 );
					$title.text( node.title ).attr('title', node.title);
					$date.text( myFmt(date,now) );
					$place.text( place );
					if( node.child ){
						$icon.attr('src','folder.png');
						for( var smry='', i=node.child.length-1; i>=0; i-- ) smry+='.';
						$url.text( smry );
						var $e = $item.clone(true).addClass('folder').attr('id','item'+node.id);
					}
					else{
						$icon.attr('src', node.icon ||'item.png');
						$url.text( node.url );
						var $e = $item.clone(true).attr('id','item'+node.id);
					}
					if( index++ %2 ) $e.addClass('bgcolor');
					items.appendChild( $e[0] );
				};
			}();
			// フォルダ配列生成・ノード総数カウント
			// ちょっともたつくのでsetTimeout実行して中止ボタンをすぐに表示する。
			var folders = [{ node:tree.top(), place:'' }];	// フォルダ配列
			var nodeTotal = 0;								// URL＋フォルダ数
			timer = setTimeout(function(){
				function counter( child, place ){
					nodeTotal += child.length;
					for( var i=0, n=child.length; i<n; i++ ){
						if( child[i].child ){
							folders.push({ node:child[i], place:place });
							counter( child[i].child, place +' > ' +child[i].title );
							nodeTotal--;
						}
					}
				}
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
				timer = setTimeout(findexe,0);
			},0);
			var findexe = function(){
				// 検索実行
				String.prototype.myFound = function(){
					// AND検索(TODO:OR検索・大小文字区別対応する？)
					for( var i=keywords.length-1; i>=0; i-- ){
						if( this.indexOf(keywords[i])<0 ) return false;
					}
					return true;
				};
				items.innerHTML = '';
				var $finding = $('#finding');
				var now = (new Date()).getTime();
				var index = 0;
				var total = 0;
				(function finder(){
					var limit = total +21; // 20ノード以上ずつ
					while( index < folders.length && total<limit ){
						var folder = folders[index];
						// フォルダ名
						if( folder.node.title.myNormal().myFound() ){
							$itemAppend( folder.node, now, folder.place );
						}
						total++;
						// ブックマークタイトルとURL
						var child = folder.node.child;
						var place = (folder.place.length? folder.place +' > ' :'') +folder.node.title;
						for( var i=0, n=child.length; i<n; i++ ){
							if( child[i].child ) continue;
							if( (child[i].title +child[i].url).myNormal().myFound() ){
								$itemAppend( child[i], now, place );
							}
							total++;
						}
						index++;
					}
					// 進捗バー
					$finding.progressbar('value',total*100/nodeTotal);
					// 次
					if( index < folders.length ) timer = setTimeout(finder,0);
					else{
						finalize();
						if( items.children.length<=0 ) $('#itembox').children('.spacer').text('見つかりません');
					}
				})();
			};
		}
		else if( arg0==='poke' ){
			// アイテム欄の選択ブックマークをリンク切れ調査(フォルダ/javascriptは無視)
			// TODO:YouTubeがアクセスしすぎるとすべて 429 Too Many Requests で閲覧できなくなる。
			// しばらくすると復活するが、リンク切れ調査はぜんぶエラーになってしまう・・・。
			var title = $head3.text();
			if( !/調査/.test(title) ) $head3.text( title +' / 調査結果' );
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
					queue.push( $url );
				}
			}
			// ajax発行
			var $imgsrc = $('<img class=icon style="margin-left:0">');
			var qix = 0;
			ajaxer = function( aix ){
				if( aix===false ){ $imgsrc.remove(); return; }
				var $urls = [] ,reqBody = '';
				// 1ajaxで3URLずつ
				for( var i=3; i>0 && qix < queue.length; i-- ){
					var $url = queue[qix++];
					$urls.push( $url );
					reqBody += ':'+$url.text()+'\r\n'; // TODO:URLエスケープ(encodeURI使えない)
				}
				if( reqBody ){
					ajaxs[aix] = $.ajax({
						type:'post'
						,url:':poke'
						,data:reqBody
						,error:function(xhr){
							if( !ajaxer ) return;
							for( var i=0; i<$urls.length; i++ ){
								$urls[i].next().text( xhr.status+' '+xhr.statusText )
								.prepend( $imgsrc.clone().attr('src','delete.png') );
							}
						}
						,success:function(data){
							if( !ajaxer ) return;
							// data.length==$urls.length のはずだが…
							for( var i=0; i<$urls.length; i++ ){
								var ico='question.png' ,cls='';					// 不明
								switch( data[i].ico ){
								case 'O': ico='ok.png'; break;					// 正常
								case 'E': ico='delete.png'; break;				// エラー
								case 'D': ico='skull.png'; cls='dead'; break;	// 死亡
								case '!': ico='warn.png'; break;				// 注意
								}
								$urls[i].next().text( data[i].msg +(data[i].url.length? ' ≫'+data[i].url :'') )
								.prepend( $imgsrc.clone().attr('src',ico) );
								$urls[i].parent().addClass( cls );
							}
						}
						,complete:function(){ if( ajaxer ) ajaxer(aix); }
					});
				}
			};
			// ajax4並列
			for( var i=0; i<4; i++ ) ajaxer(i);
		}
		else if( arg0==='deads' ){
			// リンク切れ調査(フォルダ)
			// TODO:YouTubeがアクセスしすぎるとすべて 429 Too Many Requests で閲覧できなくなる。
			// しばらくすると復活するが、リンク切れ調査はぜんぶエラーになってしまう・・・。
			// TODO:実行中と完了の違いが微妙でパッと見終わったかどうか判断しづらい
			// TODO:調査中にフォルダ表示や検索で中断される前に確認ダイアログ？不要かな
			kind = 'deads';
			$('#deadinfo').remove();
			$head3.removeClass('iconurl').removeClass('place').addClass('status').text('調査結果');
			var items = doc.getElementById('items');
			var $total = $('<span class=count>0</span>');
			var $ok = $('<span class=count>0</span>');
			var $err = $('<span class=count>0</span>');
			var $dead = $('<span class=count>0</span>');
			var $warn = $('<span class=count>0</span>');
			var $unknown = $('<span class=count>0</span>');
			var $totalbox = $('<span><img class=icon src=item.png>総数</span>').append( $total );
			var $okbox = $('<span><img class=icon src=ok.png>正常</span>').append( $ok );
			var $errbox = $('<span><img class=icon src=delete.png>エラー</span>').append( $err );
			var $deadbox = $('<span><img class=icon src=skull.png>リンク切れ</span>').append( $dead );
			var $warnbox = $('<span><img class=icon src=warn.png>注意</span>').append( $warn );
			var $unknownbox = $('<span><img class=icon src=question.png>不明</span>').append( $unknown );
			var $folderName = $('<span></span>');
			var $info = $('<div id=deadinfo>リンク切れ調査 <img class=icon src=folder.png></div>')
				.on('dying',function(){ $('#itembox').height( $('#folderbox').height() -$head.outerHeight() ); })
				.prepend(
					$('<button><img class=icon src=stop.png>中止</button>')
					.button().click(function(){ $(this).remove(); finalize(); })
				)
				.append( $folderName )
				.append('<br>')
				.append( $totalbox ).append( $okbox ).append( $errbox )
				.append( $deadbox ).append( $warnbox ).append( $unknownbox )
				.width( $head.width() )
				.insertBefore( $head );
			$('#itembox').height( $('#folderbox').height() -$head.outerHeight() -$info.outerHeight() )
				.children('.spacer').html('<img src=wait.gif>');
			// ノード配列作成
			var queuer = function( node ){
				if( node.url.length <=0 ) return;
				if( /^javascript:/i.test(node.url) ) return;
				queue.push( node );
			};
			var childer = function( child ){
				for( var i=child.length-1; i>=0; i-- ){
					if( child[i].child ) childer( child[i].child );
					else queuer( child[i] );
				}
			};
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
			else return;
			// ajax発行
			$itemAppend = function(){
				var $item = $('<div class=item tabindex=0></div>').on('mouseleave',itemMouseLeave);
				var $icon = $('<img class=icon>');
				var $title = $('<span class=title></span>');
				var $url = $('<span class=url></span>');
				var $stat = $('<span class=status></span>');
				var $img = $('<img class=icon style="margin-left:0">');
				var $date = $('<span class=date></span>');
				var $br = $('<br class=clear>');
				var $hTitle = $head.find('.title');
				var $hUrl = $head.find('.url');
				var $hDate = $head.find('.date');
				var date = new Date();
				var now = (new Date()).getTime();
				var index = 0;
				$item.append($icon).append($title).append($url).append($stat).append($date).append($br);
				return function( node ,ico ,txt ,cls ){
					if( node===false ){ $item.remove(); return; }
					date.setTime( node.dateAdded ||0 );
					$icon.attr('src', node.icon ||'item.png');
					$title.text( node.title ).attr('title', node.title).width( $hTitle.width() -18 );
					$url.text( node.url ).width( $hUrl.width() +4 );
					$stat.text( txt ).prepend( $img.attr('src',ico) ).width( $head3.width() +4 );
					$date.text( myFmt(date,now) ).width( $hDate.width() +2 );
					var $e = $item.clone(true).attr('id','item'+node.id).addClass( cls );
					if( index++ %2 ) $e.addClass('bgcolor');
					items.appendChild( $e[0] );
				};
			}();
			var count = { total:0 ,ok:0 ,err:0 ,dead:0 ,warn:0 ,unknown:0 };
			var	qix = 0;
			ajaxer = function( aix ){
				if( aix===false ) return;
				var nodes = [] ,reqBody = '';
				// 1ajaxで3URLずつ
				for( var i=3; i>0 && qix < queue.length; i-- ){
					var node = queue[qix++];
					nodes.push( node );
					reqBody += ':'+node.url+'\r\n'; // TODO:URLエスケープ(encodeURI使えない)
				}
				if( reqBody ){
					ajaxs[aix] = $.ajax({
						type:'post'
						,url:':poke'
						,data:reqBody
						,error:function(xhr){
							if( !ajaxer ) return;
							for( var i=0; i<nodes.length; i++ ){
								count.err++;
								$itemAppend( nodes[i] ,'delete.png' ,xhr.status+' '+xhr.statusText );
							}
						}
						,success:function(data){
							if( !ajaxer ) return;
							// data.length==nodes.length のはずだが…
							for( var i=0; i<nodes.length; i++ ){
								var ico='question.png' ,cls='';								// 不明
								switch( data[i].ico ){
								case 'O': count.ok++; continue;								// 正常
								case 'E': count.err++; ico='delete.png'; break;				// エラー
								case 'D': count.dead++; ico='skull.png'; cls='dead'; break;	// 死亡
								case '!': count.warn++; ico='warn.png'; break;				// 注意
								default: count.unknown++;
								}
								$itemAppend( nodes[i] ,ico ,data[i].msg +(data[i].url.length? ' ≫'+data[i].url :'') ,cls );
							}
						}
						,complete:function(){ if( ajaxer ) count.total+=nodes.length ,ajaxer(aix); }
					});
				}
			};
			// ajax4並列
			for( var i=0; i<4; i++ ) ajaxer(i);
			items.innerHTML = '';
			// 完了待ち進捗表示ループ
			(function waiter(){
				$ok.text( count.ok );
				$err.text( count.err );
				$dead.text( count.dead );
				$warn.text( count.warn );
				$unknown.text( count.unknown );
				if( count.total < queue.length ){
					$total.text( count.total +' / '+ queue.length );
					timer = setTimeout(waiter,250);
					return;
				}
				// 完了
				$total.text( queue.length );
				if( count.ok==0 ) $okbox.remove();
				if( count.err==0 ) $errbox.remove();
				if( count.dead==0 ) $deadbox.remove();
				if( count.warn==0 ) $warnbox.remove();
				if( count.unknown==0 ) $unknownbox.remove();
				$('#deadinfo').find('button').remove();
				finalize();
			})();
		}
		else{
			// フォルダ表示
			kind = 'child';
			$('#deadinfo').trigger('dying').remove();
			$head3.removeClass('place').removeClass('status').addClass('iconurl').text('アイコン');
			var items = doc.getElementById('items');
			$itemAppend = function(){
				var urlWidth = $head.find('.url').width() +4;
				var iurlWidth = $head3.width() +4;
				var $item = $('<div class=item tabindex=0></div>').on('mouseleave',itemMouseLeave);
				var $icon = $('<img class=icon>');
				var $title = $('<span class=title></span>').width( $head.find('.title').width() -18 );
				var $url = $('<span class=url></span>').width( urlWidth );
				var $iurl = $('<span class=iconurl></span>').width( iurlWidth );
				var $smry = $('<span class=summary></span>').width( urlWidth +iurlWidth +6 );
				var $date = $('<span class=date></span>').width( $head.find('.date').width() +2 );
				var $br = $('<br class=clear>');
				var $folTitle = $title.clone();
				var $folDate = $date.clone();
				var $folder = $item.clone(true)
					.addClass('folder')
					.append( $icon.clone().attr('src','folder.png') )
					.append( $folTitle )
					.append( $smry )
					.append( $folDate )
					.append( $br.clone() );
				$item.append($icon).append($title).append($url).append($iurl).append($date).append($br);
				var date = new Date();
				var index = 0;
				return function( node, now ){
					if( node===false ){ $folder.remove(); $item.remove(); return; }
					date.setTime( node.dateAdded ||0 );
					if( node.child ){
						$folTitle.text( node.title ).attr('title', node.title);
						$folDate.text( myFmt(date,now) );
						for( var smry='', i=node.child.length-1; i>=0; i-- ) smry+='.';
						$smry.text( smry );
						var $e = $folder.clone(true).attr('id','item'+node.id);
					}
					else{
						$icon.attr('src', node.icon ||'item.png');
						$title.text( node.title ).attr('title', node.title);
						$url.text( node.url );
						$iurl.text( node.icon );
						$date.text( myFmt(date,now) );
						var $e = $item.clone(true).attr('id','item'+node.id);
					}
					if( index++ %2 ) $e.addClass('bgcolor');
					items.appendChild( $e[0] );
				};
			}();
			items.innerHTML = '';
			selectItemClear();
			var now = (new Date()).getTime();
			var child = arg0.child;
			var length = child.length;
			var index = 0;
			(function lister(){
				var count=10;
				while( index < length && count>0 ){
					$itemAppend( child[index], now );
					index++; count--;
				}
				if( index < length ) timer = setTimeout(lister,0);
				else $itemAppend(false);
			})();
		}
	};
}();
// フォルダイベント
$('#folders')
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
	$('#items')
	.on('mousedown','.item',data,itemMouseDown)
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
		// 右クリックメニュー隠す
		for( var e=ev.target; e; e=e.parentNode ) if( e.id=='contextmenu' ) return false;
		$('#contextmenu').hide();
		if( onContextHide ) onContextHide();
		// inputタグはフォーカスするためtrue返す
		if( ev.target.tagName=='INPUT' ) return true;
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
$('#modified').click(function(){ $('#editbox').blur(); treeSave(); });
// パネル画面に戻る
$('#home').click(function(){
	itemList(false);
	if( tree.modified() ) Confirm({
		msg	:'変更が保存されていません。いま保存して次に進みますか？　「いいえ」で変更を破棄して次に進みます。'
		,width:380
		,yes:function(){ treeSave({ success:home }); }
		,no :home
	});
	else home();
	function home(){ location.href = '/'; }
});
// ログアウト
if( /session=.+/.test(document.cookie) ){
	$('#logout').click(function(){
		itemList(false);
		if( tree.modified() ) Confirm({
			msg	:'変更が保存されていません。いま保存してログアウトしますか？　「いいえ」で変更を破棄してログアウトします。'
			,width:380
			,yes:function(){ treeSave({ success:logout }); }
			,no :logout
		});
		else logout();
		function logout(){
			$.ajax({
				url		:':logout'
				,error	:function(xhr){ Alert('エラー:'+xhr.status+' '+xhr.statusText); }
				,success:function(data){
					// dataはセッションID:過去日付でクッキー削除
					document.cookie = 'session='+data+'; expires=Thu, 01-Jan-1970 00:00:01 GMT';
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
	folderTree({
		clickID:nid
		,clickAfter:function(){
			// アイテム選択(ノードID=XXXならアイテムボックスID=itemXXX)
			var $item = $('#item'+node.id);
			// $item.mousedown().mouseup();と書きたいところだが、
			// IE8はmousedown()でエラー発生する仕様なのが影響してか、
			// mouseup()およびその先の処理も実行されないもよう。
			// 仕方がないのでsetTimeoutを使う。
			setTimeout(function(){ $item.mousedown(); },0);
			setTimeout(function(){
				$item.mouseup();
				// 名前変更・テキスト選択
				if( !name.length ) edit( $item.children('.title')[0], {select:true} );
			},1);
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
			$.post(':analyze',url+'\r\n',function(data){ // TODO:URLエスケープ(encodeURI使えない)
				data = data[0];
				if( data.title.length ){
					data.title = HTMLdec( data.title );
					if( tree.nodeAttr( node.id,'title',data.title ) >1 )
						$('#item'+node.id).find('.title').text( data.title );
				}
				if( data.icon.length ){
					if( tree.nodeAttr( node.id,'icon',data.icon ) >1 )
						$('#item'+node.id).find('.icon').attr('src',data.icon).end().find('.iconurl').text(data.icon);
				}
			});
		}
		// DOM再構築
		$(selectFolder).removeClass('select').click();
		// アイテム選択 ノードID=XXXならアイテムボックスID=itemXXX
		var $item = $('#item'+node.id);
		// $item.mousedown().mouseup();と書きたいところだが、
		// IE8はmousedown()でエラー発生する仕様なのが影響してか、
		// mouseup()およびその先の処理も実行されないもよう。
		// 仕方がないのでsetTimeoutを使う。
		setTimeout(function(){ $item.mousedown(); },0);
		setTimeout(function(){
			$item.mouseup();
			if( !url.length ) edit( $item.children('.url')[0] ); // URL編集
		},1);
		$('#newurl').val('');
	}
	,contextmenu:function(ev){
		if( isLocalServer ){
			var $menu = $('#contextmenu').width(250);
			var $box = $menu.children('div').empty();
			// クリップボードから登録
			$box.append($('<a><img src=newitem.png>クリップボードのURLを新規登録</a>').click(function(){
				$menu.hide();
				// 選択フォルダ先頭に登録
				clipboardTo( tree.node( selectFolder.id.slice(6) ), 0 );
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
$('#find').click(function(){ itemList('finds',true); });
$('#keyword').keypress(function(ev){
	switch( ev.which || ev.keyCode || ev.charCode ){
	case 13: $('#find').click(); return false;
	}
});
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
				else itemList( tree.node(selectFolder.id.slice(6)) );
			};
			if( tree.trashHas(ids[0]) ){
				// ごみ箱
				Confirm({
					msg:ids.length+'個のアイテムを完全に消去します。'
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
				tree.moveChild( otherIDs.concat(), tree.trash() );
				if( hasFolder ) folderTree({});
				switch( itemList('?') ){
				case 'finds': itemList('finds'); break;
				case 'deads':
					for( var i=otherIDs.length-1; i>=0; i-- ) $('#item'+otherIDs[i]).remove();
					// 調査中にごみ箱を空にした場合など既にノードが存在しない場合がある。
					// 存在しないノードは「移動しました」メッセージは出さずに消えるのみ。
					for( var i=otherIDs.length-1; i>=0; i-- ) if( !tree.node(otherIDs[i]) ) otherIDs.splice(i,1);
					if( otherIDs.length ) Notify(otherIDs.length+'個のアイテムをごみ箱に移動しました。');
					for( var i=trashIDs.length-1; i>=0; i-- ) $('#item'+trashIDs[i]).remove();
					break;
				}
			};
			if( trashIDs.length>0 ){
				Confirm({
					msg:trashIDs.length+'個のごみ箱アイテムを完全に消去します。'
					,$e:$(trashTitles)
					,width:400
					,height:210 + trashIDs.length *19
					,resize:true
					,ok:function(){ tree.eraseNodes( trashIDs.concat() ); redraw(); }
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
					msg:'フォルダ「' +$('.title',select).text() +'」を完全に消去します。'
					,ok:function(){
						tree.eraseNode( nid );
						switch( itemList('?') ){
						case 'deads':
							folderTree({});
							// アイテム欄で既に存在しないものを消去
							for( var items=doc.getElementById('items').children ,i=items.length-1; i>=0; i-- ){
								if( !tree.node(items[i].id.slice(4)) ) $(items[i]).remove();
							}
							break;
						case 'finds': folderTree({}), itemList('finds'); break;
						case 'child': folderTree({ click0:true }); break;
						}
					}
				});
			}
			else{
				tree.moveChild( [nid], tree.trash() );
				switch( itemList('?') ){
				case 'deads': folderTree({}); break;
				case 'finds': folderTree({}), itemList('finds'); break;
				case 'child': folderTree({ clickID:nid }); break;
				}
			}
		}
	}
});
// リンク切れ調査(全フォルダ)
$('#deadlink').click(function(){
	Confirm({
		msg:'全フォルダ(全ブックマークURL)のリンク切れ調査を行います。'
		,ok:function(){ itemList('deads',tree.root); }
	});
});
// ツールバーボタンキー入力
$('.barbtn')
	// Enterでクリック
	.keypress(function(ev){
		switch( ev.which || ev.keyCode || ev.charCode ){
		case 13: $(this).click(); return false;
		}
	})
	// 右端ボタンTAB押しでフォルダツリーにフォーカス
	.last().keydown(function(ev){
		switch( ev.which || ev.keyCode || ev.charCode ){
		case 9: if( !ev.shiftKey ){ $(selectFolder).trigger('selfclick'); return false; }
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
	var folderboxWidth = $folderbox.width();
	var itemboxWidth = $itembox.width();
	var downX = ev.pageX;
	$(doc).on('mousemove.border',function(ev){
		var dx = ev.pageX -downX;
		var newFolderboxWidth = folderboxWidth +dx;
		var newItemboxWidth = itemboxWidth -dx;
		if( newFolderboxWidth >20 && newItemboxWidth >20 ){
			$folderbox.width( newFolderboxWidth );
			$itembox.width( newItemboxWidth );
			$('#itemhead').width( newItemboxWidth );
			$('#deadinfo').width( newItemboxWidth );
		}
	})
	.one('mouseup',function(){
		$(doc).off('mousemove.border');
		$border.removeClass('drag');
		// TODO:位置保存する…？
	});
});
// アイテム欄項目ヘッダのボーダー
// TODO:タイトル欄を右に広げたら行き止まりなのを改善したい
$('.itemborder').mousedown(function(ev){
	$('#editbox').blur();
	var $attrhead = $(this).prev();				// クリックしたボーダの左側の項目ヘッダ(.title/.url/.iconurl/.place/.status)
	var $lasthead = $('#itemhead span').last();	// 右端の項目ヘッダ(.date)
	var $attr='', $smry='';
	if( $attrhead.hasClass('title') ){
		$attr = $('#items').find('.title');
	}else{
		var selector = '.'+$attrhead.attr('class');
		// .iconurlと.placeの時は.statusが混ざってる場合がある
		if( selector=='.iconurl' || selector=='.place' ) selector += ', .status';
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
		if( newAttrheadWidth >20 && newLastheadWidth >20 ){
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
// アイテム欄下余白から矩形選択
$('#itembox').on({
	mousedown:function(ev){
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
				for( var items=$items[0].children ,i=items.length-1; i>=0; i-- ){
					$(items[i]).removeClass('inactive');
				}
			}else{
				// 選択なし
				selectItemClear();
			}
			itemSelectStart( null, downX, downY );
		}
	}
	,contextmenu:function(ev){
		if( itemList('?')=='child' && (ev.target.className=='spacer' || ev.target.id=='itembox') && isLocalServer ){
			var $menu = $('#contextmenu').width(250);
			var $box = $menu.children('div').empty();
			// クリップボードから登録
			$box.append($('<a><img src=newitem.png>クリップボードのURLを新規登録</a>').click(function(){
				$menu.hide();
				// 選択フォルダ末尾に登録
				var pnode = tree.node( selectFolder.id.slice(6) );
				clipboardTo( pnode, pnode.child.length );
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
function resize(){
	$('#editbox').blur();
	var windowWidth = $(win).width();// -1; // 適当-1px
	var folderboxWidth = (this==win)? $('#folderbox').width() : (windowWidth /5.3)|0;
	var folderboxHeight = $(win).height() -$('#toolbar').outerHeight() -(tree.modified()? 22:0);
	var itemboxWidth = windowWidth -folderboxWidth -$('#border').outerWidth();
	if( itemboxWidth <20 ){	// アイテム欄狭すぎ自動調整20px適当
		folderboxWidth = (windowWidth /5.3)|0;
		itemboxWidth = windowWidth -folderboxWidth -$('#border').outerWidth();
	}
	var itemsWidth = ((itemboxWidth <400)? 400 : itemboxWidth) -17;			// スクロールバー17px(?)
	var titleWidth = (itemsWidth /2.3)|0;									// 割合適当
	var urlWidth = ((itemsWidth -titleWidth) /2.6)|0;						// 割合適当
	var iconWidth = ((itemsWidth -titleWidth -urlWidth) /1.9)|0;			// 割合適当
	var dateWidth = itemsWidth -titleWidth -urlWidth -iconWidth;

	$('#toolbar') // ボタン類がfloatで下にいかないよう
		.width( (windowWidth <780)? 780 : windowWidth );
	$('#folderbox')
		.width( folderboxWidth )
		.height( folderboxHeight );
	$('#border')
		.height( folderboxHeight );
	$('#itembox')
		.width( itemboxWidth )
		.height(
			folderboxHeight
			- $('#itemhead') // アイテムヘッダのボーダーと合うよう適当に増減して設定
				.width( itemboxWidth )
				.find('.title').width( titleWidth ).end()
				.find('.url').width( urlWidth ).end()
				.find('.iconurl, .place, .status').width( iconWidth ).end()
				.find('.date').width( dateWidth -38 ).end()			// -38px適当float対策
				.outerHeight()
			- $('#deadinfo')
				.width( itemboxWidth )
				.outerHeight()
		);
	$('#items')
		.width( itemsWidth )
		.find('.title').width( titleWidth -18 ).end()					// アイコンのぶん-18px
		.find('.url').width( urlWidth +4 ).end()						// itemborderのぶん+4px
		.find('.iconurl, .place, .status').width( iconWidth +4 ).end()	// itemborderのぶん+4px
		.find('.summary').width( urlWidth +iconWidth +14 ).end()		// 見た目で合うように+14px
		.find('.date').width( dateWidth -35);							// float対策適当-36px
}
// 画面サイズ縦のみ変更
function resizeV( padding ){
	var folderboxHeight = $(win).height() -$('#toolbar').outerHeight() -padding;
	$('#folderbox').height( folderboxHeight );
	$('#border').height( folderboxHeight );
	$('#itembox').height( folderboxHeight -$('#itemhead').outerHeight() -$('#deadinfo').outerHeight() );
}
// 矩形選択
// TODO:アイテム欄の上下自動スクロール
function itemSelectStart( element, downX, downY ){
	// 変更を反映
	$('#editbox').blur();
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
		for( var i=items.length-1; i>=0; i-- ){
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
			resizeV(0);
			if( arg && arg.success ) arg.success();
		}
	});
}
// マウスイベント
function folderClick(ev){
	// ＋－ボタンは無視
	if( ev.target.className=='sub' ) return;
	if( itemList('?')=='child' && $(this).hasClass('select') ){
		var $this = $(select=this);
		// 選択アイテムを非アクティブに
		for( var items=doc.getElementById('items').children ,i=items.length-1; i>=0; i-- ){
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
			itemList( node );
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
function itemSelfClick( ev, shiftKey ){
	if( IE && IE<9 ){
		// IE8はmousedown()でエラー発生する仕様なのが影響してか、
		// mouseup()が実行されない？仕方がないのでsetTimeoutを使う。
		var $this = $(this);
		setTimeout(function(){ $this.trigger('mousedown',shiftKey); },0);
		setTimeout(function(){ $this.mouseup().click().focus(); },1);
	}
	else{
		$(this).trigger('mousedown',shiftKey).mouseup().click().focus();
	}
}
function itemMouseDown( ev, shiftKey ){
	// イベント間通知
	ev.data.itemID = this.id;
	ev.data.itemNotify = '';
	ev.shiftKey = shiftKey || ev.shiftKey;
	// 選択フォルダ非アクティブ
	$(selectFolder).addClass('inactive');
	// 選択アイテムをアクティブに
	for( var items=doc.getElementById('items').children ,i=items.length-1; i>=0; i-- ){
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
			for( var items=doc.getElementById('items').children ,i=items.length-1; i>=0; i-- ){
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
	var paddingLeft = parseInt($fo.css('padding-left')) +15;	// +15px <img class=sub> の幅
	if( /plus.png$/.test(this.src) ){
		for( var $fo=$fo.next(); $fo.hasClass('folder'); $fo=$fo.next() ){
			if( paddingLeft < parseInt($fo.css('padding-left')) )
				$fo = subView( $fo.show() );
			else
				break;
		}
		$my.attr('src','minus.png');
	}
	else{
		for( var $fo=$fo.next(); $fo.hasClass('folder'); $fo=$fo.next() ){
			if( paddingLeft < parseInt($fo.css('padding-left')) )
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
			var paddingLeft = parseInt($fo.css('padding-left')) +15;	// +15px <img class=sub> の幅
			for( var $nx=$fo.next(); $nx.hasClass('folder'); $nx=$nx.next() ){
				if( paddingLeft < parseInt($nx.css('padding-left')) ){
					if( show ) $nx = subView( $nx.show() );
					$fo = $nx;
				}
				else break;
			}
		}
		return $fo;
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
	.on('mousemove.itemdrag','.folder, .item',function(ev){
		if( !draggie ) itemDragJudge(ev);
		if( draggie ){
			// ドラッグ先が自分の時は何もしない
			if( draggie.id==this.id ) return;
			var $this = $(this);
			// 複数選択ドラッグアイテムどうしは何もしない(ドロップ不可)
			if( draggie.id.indexOf('item')==0 && this.id.indexOf('item')==0 && $this.hasClass('select') ) return;
			// ドロップ要素スタイル適用
			$this.removeClass('dropTop').removeClass('dropBottom').removeClass('dropIN');
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
	.one('mouseup','.folder, .item',function(ev){
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
				//$debug.text(dragItem.ids+' が、'+this.id+' にdropTopされました');
				tree.moveSibling( dragItem.ids.concat(), this.id.replace(/^\D*/,'') );
			}
			else if( $this.hasClass('dropBottom') ){
				//$debug.text(dragItem.ids+' が、'+this.id+' にdropBottomされました');
				tree.moveSibling( dragItem.ids.concat(), this.id.replace(/^\D*/,''), true );
			}
			else if( $this.hasClass('dropIN') ){
				//$debug.text(dragItem.ids+' が、'+this.id+' にdropINされました');
				tree.moveChild( dragItem.ids.concat(), this.id.replace(/^\D*/,'') );
			}
			else return; // ドロップ不可
			$this.removeClass('dropTop').removeClass('dropBottom').removeClass('dropIN');
			// 表示更新
			switch( itemList('?') ){
			case 'deads':
				if( dragItem.folderCount >0 ) folderTree({});
				// リンク切れ調査結果からドラッグ移動したアイテムはアイテム欄から消す
				for( var i=dragItem.ids.length-1; i>=0; i-- ) $('#item'+dragItem.ids[i]).remove();
				break;
			case 'finds':
				if( dragItem.folderCount >0 ) folderTree({});
				itemList('finds');
				break;
			case 'child':
				if( dragItem.folderCount >0 ) folderTree({ clickID:selectFolder.id.slice(6) });
				else itemList( tree.node(selectFolder.id.slice(6)) );
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
				for( var items=doc.getElementById('items').children ,i=items.length-1; i>=0; i-- ){
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
			edit( doc.elementFromPoint( ev.pageX, ev.pageY ) );
			return;
		}
	}
}
function itemDblClick(){
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
	var width = 210;
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
				.append($('<a><img src=question.png>タイトル/アイコンを取得</a>').click(function(){
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
											.children('.iconurl').text($iconurl.val());
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
							,data:url+'\r\n' // TODO:URLエスケープ(encodeURI使えない)
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
	if( itemList('?')=='child' && isLocalServer ){
		// クリップボードから登録
		if( width<250 ) width=250;
		$box.append($('<a><img src=newitem.png>クリップボードのURLを新規登録</a>').click(function(){
			$menu.hide();
			// 選択アイテム位置に登録
			var pnode = tree.nodeParent( nid );
			for( var index=pnode.child.length-1; index>=0; index-- ){
				if( pnode.child[index].id==nid ) break;
			}
			clipboardTo( pnode, index );
		}));
	}
	if( $box[0].children.length ) $box.append('<hr>');
	if( $(item).hasClass('folder') ){
		$box.append($('<a><img src=skull.png>リンク切れ調査(フォルダ)</a>').click(function(){
			$menu.hide(); itemList('deads','folder');
		}));
	}
	else{
		if( url.length ){
			$box.append($('<a><img src=skull.png>リンク切れ調査</a>').click(function(){
				$menu.hide(); itemList('poke');
			}));
		}
		if( $('#deadinfo').length ){
			$box.append($('<a><img src=check.png>おなじ種類をすべて選択</a>').click(function(){
				$menu.hide();
				var ico = $(item).children('.status').children('.icon').attr('src');
				for( var items=doc.getElementById('items').children ,i=items.length-1; i>=0; i-- ){
					var $item = $(items[i]);
					if( $item.children('.status').children('.icon').attr('src')==ico )
						$item.addClass('select');
				}
			}));
		}
		if( $(item).children('.status').text().match(/≫.+/) ){
			$box.append($('<a><img src=pen.png>転送先URLに書き換え</a>').click(function(){
				$menu.hide();
				for( var items=doc.getElementById('items').children ,i=items.length-1; i>=0; i-- ){
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
		if( $('#deadinfo').length ){
			$box.append($('<a><img src=minus.png>一覧から除外</a>').click(function(){
				$menu.hide();
				for( var items=doc.getElementById('items').children ,i=items.length-1; i>=0; i-- ){
					var $item = $(items[i]);
					if( $item.hasClass('select') ) $item.remove();
				}
			}));
		}
	}
	if( $box[0].children.length ) $box.append('<hr>');
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
	var width = 100;
	// クリップボードから登録
	if( isLocalServer ){
		if( width<250 ) width=250;
		$box.append($('<a><img src=newitem.png>クリップボードのURLを新規登録</a>').click(function(){
			$menu.hide(); onContextHide();
			// クリックフォルダ先頭に登録
			clipboardTo( tree.node( nid ),0 );
		}));
	}
	if( width<210 ) width=210;
	$box.append($('<a><img src=skull.png>リンク切れ調査(フォルダ)</a>').click(function(){
		$menu.hide(); onContextHide();
		itemList('deads',tree.node( nid ));
	}));
	if( nid==tree.trash().id ){
		if( width<170 ) width=170;
		$box.append('<hr>');
		$box.append($('<a><img src=delete.png>ごみ箱を空にする</a>').click(function(){
			$menu.hide(); onContextHide();
			Confirm({
				msg		:'ごみ箱の全アイテム・フォルダを完全に消去します。'
				,width	:400
				,height	:180
				,ok		:function(){
					var selectTrash = tree.trashHas( selectFolder.id.slice(6) );
					tree.trashEmpty();
					switch( itemList('?') ){
					case 'deads':
						folderTree({});
						// アイテム欄で既に存在しないものを消去
						for( var items=doc.getElementById('items').children ,i=items.length-1; i>=0; i-- ){
							if( !tree.node(items[i].id.slice(4)) ) $(items[i]).remove();
						}
						break;
					case 'finds': folderTree({}), itemList('finds'); break;
					case 'child':
						if( selectTrash ) folderTree({ click0:true });
						else folderTree({ clickID:selectFolder.id.slice(6) });
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
					msg		:'フォルダ「' +$('.title',folder).text() +'」を完全に消去します。'
					,width	:400
					,height	:200
					,ok		:function(){
						tree.eraseNode( nid );
						switch( itemList('?') ){
						case 'deads':
							folderTree({});
							// アイテム欄で既に存在しないものを消去
							for( var items=doc.getElementById('items').children ,i=items.length-1; i>=0; i-- ){
								if( !tree.node(items[i].id.slice(4)) ) $(items[i]).remove();
							}
							break;
						case 'finds': folderTree({}), itemList('finds'); break;
						case 'child':
							if( folder===selectFolder ) folderTree({ click0:true });
							else folderTree({ clickID:selectFolder.id.slice(6) });
							break;
						}
					}
				});
			}));
		}
		else{
			$box.append($('<a><img src=trash.png>削除</a>').click(function(){
				$menu.hide(); onContextHide();
				tree.moveChild( [nid], tree.trash() );
				switch( itemList('?') ){
				case 'deads': folderTree({}); break;
				case 'finds': folderTree({}), itemList('finds'); break;
				case 'child': folderTree({ clickID:selectFolder.id.slice(6) }); break;
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
	case 9: // TAB
		// アイテム欄にフォーカス、Shift押してたらツールバー右端ボタンにフォーカス
		ev.shiftKey? $('.barbtn').last().focus() : $(selectItemLast||$('#items').children()[0]).trigger('selfclick');
		return false;
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
	case 9: // TAB
		// フォーカス移動：通常ツールバー左端ボタンへ、Shift押しはフォルダツリーへ
		ev.shiftKey? $(selectFolder).trigger('selfclick') : $('.barbtn:first').focus();
		return false;
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
	for( var items=doc.getElementById('items').children ,i=items.length-1; i>=0; i-- ){
		$(items[i]).removeClass('select').removeClass('inactive');
	}
	selectItemLast = null;
}
// TODO:Firefoxのブックマーク管理画面みたいに右下に編集画面があるタイプのが使いやすいかな？
function edit( element, opt ){
	var $editbox = $('#editbox');
	var fontWeight = 'normal';
	if( element ){
		switch( element.className ){
		case 'title': fontWeight = 'bold';
		case 'url':
		case 'iconurl':
			// element全体見えるようスクロール
			viewScroll( element );
			// スクロールが発生した場合にscrollイベントが発生するが、ここで編集ボックス表示した後に
			// scrollイベント発生するようで、そこで編集ボックスを消しているので、消えてしまう。
			//		スクロール→編集ボックス表示→scrollイベントで編集ボックス消え
			// 回避のためsetTimeoutで実行して、ここの処理より先にscrollイベントを発生させる。
			//		スクロール→scrollイベントで編集ボックス消え→編集ボックス表示
			setTimeout(function(){
				var $e = $(element);
				var offset = $e.offset();
				var isFolderTree = (element.parentNode.id.indexOf('folder')==0)? true:false;
				$editbox.css({
					left			:offset.left -1
					,top			:offset.top -1
					,width			:isFolderTree? $('#folders').width() -element.offsetLeft : element.offsetWidth -1
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
								// アイテム欄のフォルダの場合、フォルダツリーも更新
								// TODO:スクロールが初期化されてしまうフォルダツリー欄の表示状態維持すべき
								var $parent = $(element.parentNode);
								if( $parent.hasClass('item') && $parent.hasClass('folder') ) folderTree({});
								if( itemList('?')=='finds' ) itemList('finds');
								break;
							case 'url':
								if( value.length ){
									// 新品アイテムはURL取得解析する
									var node = tree.node( nid );
									if( node.title=='新規ブックマーク' ){
										$.post(':analyze',value+'\r\n',function(data){ // TODO:URLエスケープ(encodeURI使えない)
											data = data[0];
											if( data.title.length && node.title=='新規ブックマーク' ){
												data.title = HTMLdec( data.title );
												if( tree.nodeAttr( nid,'title',data.title ) >1 )
													$('#item'+nid).find('.title').text( data.title );
											}
											if( data.icon.length && (!node.icon|| !node.icon.length) ){
												if( tree.nodeAttr( nid,'icon',data.icon ) >1 )
													$('#item'+nid).find('.icon').attr('src',data.icon).end().find('.iconurl').text(data.icon);
											}
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
								var needWidth = element.offsetLeft + (($e.width() *1.6)|0);
								if( needWidth > foldersWidth ) $('#folders').width( needWidth );
							}
						}
						// 終了隠す
						$(this).off().hide();
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
			},10);
			break;
		case 'status':
		case 'place':
		case 'date':
			// 場所/作成日時は変更禁止、値コピーのためボックス表示。
			setTimeout(function(){
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
					blur:function(){ $(this).off().hide(); } // なにもしない消えるだけ
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
			},10);
			break;
		}
	}
	return $editbox;
}
// element全体見えるようスクロール
function viewScroll( element ){
	// スクロール対象ボックス確認
	var boxid = element.parentNode.id;
	if( boxid.indexOf('item')==0 ) boxid = 'items';
	else if( boxid.indexOf('folder')==0 ) boxid = 'folders';
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
// クリップボードのURLを新規登録
// pnode :登録先フォルダノード
// index :登録位置インデックス
// TODO:ajaxが終わるまでは変更保存リンクをクリックしないでほしいが、実装を知らないユーザ
// にはわからない。ajax終わるまでモーダルダイアログのプログレスバー出した方がよいか？
// 変更保存リンクをプログレス状態で表示しておくのがいいかな？
function clipboardTo( pnode, index ){
	$('#dialog').empty().text('処理中です...').dialog({
		title	:'情報'
		,width	:300
		,height	:100
	});
	$.ajax({
		url:':clipboard.txt'
		,complete:function(){ $('#dialog').dialog('destroy'); }
		,success:function(data){
			var lines = data.split(/[\r\n]+/);				// 行分割
			var regTrim = /^\s+|\s+$/g;
			var regUrl = /^[A-Za-z]+:.+/;
			var url = '';
			for( var i=lines.length-1; i>=0; i-- ){			// 最後の行から
				var str = lines[i].replace(regTrim,'');		// 前後の空白削除(trim()はIE8ダメ)
				if( regUrl.test(str) ){						// URL発見
					if( url ) itemAdd( url );
					url = str;
				}
				else if( url ) itemAdd( url ,str ) ,url='';	// タイトル付URL発見
			}
			if( url ) itemAdd( url );
			// 表示更新
			$('#folder'+pnode.id).removeClass('select').click();
		}
	});
	function itemAdd( url ,title ){
		// ノード作成
		var node = tree.newURL( pnode, url, title || url.noProto(), '', index );
		if( node ){
			// タイトル/favicon取得
			$.post(':analyze',url+'\r\n',function(data){ // TODO:URLエスケープ(encodeURI使えない)
				data = data[0];
				if( !title && data.title.length ){
					data.title = HTMLdec( data.title );
					if( tree.nodeAttr( node.id,'title',data.title ) >1 )
						$('#item'+node.id).find('.title').text( data.title );
				}
				if( data.icon.length ){
					if( tree.nodeAttr( node.id,'icon',data.icon ) >1 )
						$('#item'+node.id).find('.icon').attr('src',data.icon).end().find('.iconurl').text(data.icon);
				}
			});
		}
	}
}
// 確認ダイアログ
// IE8でなぜか改行コード(\n)の<br>置換(replace)が効かないので、しょうがなく #BR# という
// 独自改行コードを導入。Chrome/Firefoxは単純に \n でうまくいくのにIE8だけまた・・
function Confirm( arg ){
	var opt ={
		title		:arg.title ||'確認'
		,modal		:true
		,resizable	:false
		,width		:365
		,height		:190
		,close		:function(){ $(this).dialog('destroy'); }
		,buttons	:{}
	};
	if( arg.ok )  opt.buttons['O K']    = function(){ $(this).dialog('destroy'); arg.ok(); }
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

	$('#dialog').html( HTMLenc( arg.msg ).replace(/#BR#/g,'<br>') ).append( arg.$e ).dialog( opt );
}
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
