// vim:set ts=4:vim modeline
(function($){
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
}).appendTo(document.body);
*/
var oStr = Object.prototype.toString;						// 型判定
var IE = window.ActiveXObject ? document.documentMode :0;	// IE判定
$.ajaxSetup({
	// ブラウザキャッシュ(主にIE)対策 http://d.hatena.ne.jp/hasegawayosuke/20090925/p1
	beforeSend:function(xhr){
		xhr.setRequestHeader('If-Modified-Since','Thu, 01 Jun 1970 00:00:00 GMT');
	}
});
var select = null;				// 選択フォルダorアイテム
var selectFolder = null;		// 選択フォルダ
var selectItemLast = null;		// 最後に単選択(通常クリックおよびCtrl+クリック)したアイテム
var draggie = null;				// ドラッグしている要素
var dragitem = {};				// 複数選択ドラッグ情報
var tree = {
	// ルートノード
	root:null
	// 変更されてるかどうか
	,_modified:false
	,modified:function( on ){
		if( arguments.length ){
			tree._modified = on;
			if( on ){
				$('#modified').show();
				$(document.body).css('padding-top',22);
				$(window).resize();
			}
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
	// 指定ノードIDのノードオブジェクト
	,node:function( id ){
		return function callee( node ){
			if( node.id==id ){
				// 見つけた
				return node;
			}
			if( node.child ){
				for( var i=0, n=node.child.length; i<n; i++ ){
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
	,newURL:function( pnode, url, title, icon ){
		var node = {
			id			:tree.root.nextid++
			,dateAdded	:(new Date()).getTime()
			,title		:title || '新規ブックマーク'
			,url		:url || ''
			,icon		:icon || ''
		};
		// 引数ノードのchild先頭に追加する
		if( oStr.call(pnode)==='[object String]' ) pnode = tree.node(pnode);
		( pnode || tree.top() ).child.unshift( node );
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
				// TODO:先頭挿入(画面で上の方に追加される)のと末尾追加(画面下の方に追加)はどっちがいいか？
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
		font	:{ css:'' }
		//,autoshot:false
	}
	,font:{
		css:function(){
			var font = option.data.font;
			// 一度目の参照時に規定値を設定
			if( font.css=='' ) font.css = 'gothic.css';
			return font.css;
		}
	}
	//,autoshot:function(){ return option.data.autoshot; }
	,init:function( data ){
		var od = option.data;
		if( 'font' in data ){
			if( 'css' in data.font ) od.font.css = data.font.css;
		}
		//if( 'autoshot' in data ) od.autoshot = data.autoshot;
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
// CSSルール追加
// http://d.hatena.ne.jp/ofk/20090716/1247719727
$.css.add=function(a,b){var c=$.css.sheet,d=!$.browser.msie,e=document,f,g,h=-1,i="replace",j="appendChild";if(!c){if(d){c=e.createElement("style");c[j](e.createTextNode(""));e.documentElement[j](c);c=c.sheet}else{c=e.createStyleSheet()}$.css.sheet=c}if(d)return c.insertRule(a,b||c.cssRules.length);if((f=a.indexOf("{"))!==-1){a=a[i](/[\{\}]/g,"");c.addRule(a.slice(0,f)[i](g=/^\s+|\s+$/g,""),a.slice(f)[i](g,""),h=b||c.rules.length)}return h};
// ブックマークデータ取得
(function(){
	var option_ok = false;
	var tree_ok = false;
	tree.load(function(){
		tree_ok = true;
		if( option_ok ) filer();
	});
	option.load(function(){
		option_ok = true;
		if( tree_ok ) filer();
	});
	function filer(){
		// フォントサイズ(meiryoは-1px)
		var fontSize = (option.font.css()=='gothic.css')? 13 : 12;
		$.css.add('#toolbar input, #folders span, #itembox span, #dragbox, #editbox{font-size:'+fontSize+'px;}');
		// フォント
		$('#fontcss').attr('href',option.font.css());
		// 表示描画
		$(window).resize();
		$('body').css('visibility','visible');
		folderTree({ click0:true });
	}
})();
// フォルダツリー生成
// folderTree({
//   click0		: true/false 最初のフォルダをクリックするかどうか
//   clickID	: クリックするフォルダノードID文字列
//   clickAfter	: クリック完了後に実行するfunction
// });
// TODO:フォルダの左側にプラスマイナスボタンほしい
// 表示/非表示の切り替えより、要素の追加/削除のほうが楽かな？
// TODO:最初はごみ箱はプラスボタンで中のフォルダ見えなくていいかも
// TODO:IE8でごみ箱のフォルダを削除や移動するとアイテム欄が更新されるのが遅く表示もたつく
var folderTree = function(){
	var timer = null;	// setTimeoutID
	return function( opt ){
		clearTimeout( timer ); // 古いのキャンセル
		var $folders = $('#folders').empty();
		var $folder = function(){
			var $e = $('<div class=folder tabindex=0><img class=icon><span class=title></span><br class=clear></div>')
					.on('mouseleave',itemMouseLeave);
			return function( id, title, icon, depth ){
				var $f = $e.clone(true).attr('id','folder'+id).css('padding-left', depth *16 );
				$f.find('img').attr('src',icon);
				$f.find('span').text( title );
				return $f;
			};
		}();
		// setTimeoutで１ノードずつDOM生成するためまずフォルダ情報の配列をつくり、
		var folderList = [];
		(function toplist( node, depth ){
			folderList.push({ id:node.id, title:node.title, icon:'folder.png', depth:depth });
			for( var i=0, n=node.child.length; i<n; i++ ){
				if( node.child[i].child )
					toplist( node.child[i], depth +1 );
			}
		})( tree.top(), 0 );
		folderList.push({ id:tree.trash().id, title:tree.trash().title, icon:'trash.png', depth:0 });
		(function trashlist( child, depth ){
			for( var i=0, n=child.length; i<n; i++ ){
				if( child[i].child ){
					folderList.push({ id:child[i].id, title:child[i].title, icon:'folder.png', depth:depth });
					trashlist( child[i].child, depth +1 );
				}
			}
		})( tree.trash().child, 1 );
		// 次に配列をつかって順次DOM生成する
		var index = 0;
		var length = folderList.length;
		var maxWidth = 0;
		(function callee(){
			var count=10;
			while( index < length && count>0 ){
				// DOM生成
				var node = folderList[index];
				var $node = $folder( node.id, node.title, node.icon, node.depth );
				$folders.append( $node );
				// #foldersの幅を設定(しないと横スクロールバーが必要な時に幅が狭くなり表示崩れる)
				var $title = $node.find('.title');
				var width = $title[0].offsetLeft + (($title.width() *1.6)|0);
				if( width > maxWidth ){
					$folders.width( width );
					maxWidth = width;
				}
				if( opt ){
					if( opt.click0 ){
						if( index==0 ) $node.click();
					}
					else if( opt.clickID ){
						if( node.id==opt.clickID ) $node.click();
					}
				}
				// 次
				index++; count--;
			}
			if( index < length ){
				timer = setTimeout(callee,1);
			}
			else{
				// 全フォルダ完了
				if( opt && opt.clickAfter ) opt.clickAfter();
			}
		})();
	};
}();
// 独自フォーマット時刻文字列
function myFmt( date, nowTime ){
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
	diff = ((nowTime - diff) /1000)|0;
	if( diff <=10 ) return 'いまさっき (' +time +')';
	if( diff <=60 ) return '1分以内 (' +time +')';
	if( diff <=3600 ) return ((diff /60)|0) +'分前 (' +time +')';
	if( diff <=3600*1.5 ) return '1時間前 (' +time +')';
	if( diff <=3600*24 ) return Math.round(diff /3600) +'時間前 (' +date +' ' +time +')';
	if( diff <=3600*24*30 ) return Math.round(diff /3600 /24) +'日前 (' +date +' ' +time +')';
	return Y +'/' +date +' ' +time;
}
// アイテム欄作成
var itemTable = function(){
	var timer = null;	// setTimeoutID
	return function( node ){
		clearTimeout( timer ); // 古いのキャンセル
		var $item = function(){
			var $e = $('<div class=item tabindex=0><img class=icon></div>')
				.on('mouseleave',itemMouseLeave);
			var $head = $('#itemhead');
			var urlWidth = $head.find('.url').width() +4;
			var iconWidth = $head.find('.iconurl').width() +4;
			var $title = $('<span class=title></span>').width( $head.find('.title').width() -18 );
			var $url = $('<span class=url></span>').width( urlWidth );
			var $icon = $('<span class=iconurl></span>').width( iconWidth );
			var $smry = $('<span class=summary></span>').width( urlWidth +iconWidth +6 );
			var $date = $('<span class=date></span>').width( $head.find('.date').width() +2 );
			var $br = $('<br class=clear>');
			var $fol = $e.clone(true)
				.addClass('folder')
				.append( $title.clone() )
				.append( $smry )
				.append( $date.clone() )
				.append( $br.clone() );
			$fol.find('img').attr('src','folder.png');
			var $url = $e
				.append( $title )
				.append( $url )
				.append( $icon )
				.append( $date )
				.append( $br );
			var date = new Date();
			return function( node, nowTime ){
				date.setTime( node.dateAdded||0 );
				if( node.child ){
					var $f = $fol.clone(true).attr('id','item'+node.id);
					$f.find('.title').text( node.title );
					$f.find('.summary').text(function(){
						for(var smry='', i=node.child.length-1; i>=0; i--) smry+='.';
						return smry;
					}());
					$f.find('.date').text( myFmt(date,nowTime) );
					return $f;
				}
				var $u = $url.clone(true).attr('id','item'+node.id);
				$u.find('img').attr('src', node.icon ||'item.png');
				$u.find('.title').text( node.title ).attr('title', node.title);
				$u.find('.url').text( node.url );
				$u.find('.iconurl').text( node.icon );
				$u.find('.date').text( myFmt(date,nowTime) );
				return $u;
			};
		}();
		var $items = $('#items').empty();
		selectItemClear();
		var nowTime = (new Date()).getTime();
		var index = 0;
		var length = node.child.length;
		(function callee(){
			var count=10;
			while( index < length && count>0 ){
				var $e = $item( node.child[index], nowTime );
				if( index%2 ) $e.addClass('bgcolor');
				$items.append( $e );
				index++; count--;
			}
			if( index < length ) timer = setTimeout(callee,1);
		})();
	};
}();
// フォルダツリーアイテムクリック
var folderClick = function(){
	return function(ev){
		if( $(this).hasClass('select') ){
			// 選択済みの場合アクティブに
			$(select=this).removeClass('inactive').focus();
			// 選択アイテムを非アクティブに
			$('#items').children().each(function(){
				if( $(this).hasClass('select') ) $(this).addClass('inactive');
			});
			// 名前編集
			//edit( document.elementFromPoint( ev.pageX, ev.pageY ) );
			// なぜかIE8でelementFromPointが動作せず、さらに.title要素を
			// inline-blockにしたら文字上クリックでしか編集できなくなった
			// ので、自力判定でblock要素のように文字上じゃなくても編集で
			// きるように変えた。jQueryオブジェクトの[0]がDOMエレメント
			// らしい。
			//var elm = $(this).find('.title')[0];
			//if( ev.pageX+3 >= elm.offsetLeft ) edit( elm );
			// フォルダツリーで横にスクロールした状態だと編集ボックスが出る
			// クリック領域がスクロール量だけ右にズレてしまうので以下に変更。
			var $e = $(this).find('.title');
			if( ev.pageX+3 >= $e.offset().left ) edit( $e[0] );
		}
		else{
			// ノード取得:自身ID=folderXXならノードID=XX
			var node = tree.node( this.id.slice(6) );
			if( node ){
				// クリックをフォルダ選択状態に
				$(selectFolder).removeClass('select inactive');
				$(select=selectFolder=this).addClass('select').focus();
				// アイテム欄作成
				itemTable( node );
			}
		}
	};
}();
// フォルダイベント
$('#folders')
.on('click','.folder',folderClick)
.on('selfclick','.folder',itemSelfClick)
.on('mousedown','.folder',folderMouseDown)
.on('mousemove','.folder',itemMouseMove)
.on('mouseup','.folder',itemMouseUp)
.on('keydown','.folder',folderKeyDown)
.on('contextmenu','.folder',folderContextMenu);
// アイテムイベント
(function(){
	var data = { itemID:'', itemNotify:'' };
	$('#items')
	.on('mousedown','.item',data,itemMouseDown)
	.on('mousemove','.item',itemMouseMove)
	.on('mouseup','.item',itemMouseUp)
	.on('click','.item',data,itemClick)
	.on('dblclick','.item',itemDblClick)
	.on('selfclick','.item',itemSelfClick)
	.on('keydown','.item',itemKeyDown)
	.on('keypress','.item',itemKeyPress)
	.on('contextmenu','.item',itemContextMenu);
})();
//
$(window).on('resize',function(){
	$('#editbox').trigger('decide');
	var windowWidth = $(window).width() -1; // 適当-1px
	var folderboxWidth = (windowWidth /5.3)|0;
	var folderboxHeight = $(window).height() -$('#toolbar').outerHeight() -(tree.modified()? 22:0);
	var itemboxWidth = windowWidth -folderboxWidth -$('#border').outerWidth();
	var itemsWidth = ((itemboxWidth <400)? 400 : itemboxWidth) -17;			// スクロールバー17px
	var titleWidth = (itemsWidth /3)|0;										// 割合適当
	var urlWidth = ((itemsWidth -titleWidth) /2.5)|0;						// 割合適当
	var iconWidth = ((itemsWidth -titleWidth -urlWidth) /1.8)|0;			// 割合適当
	var dateWidth = itemsWidth -titleWidth -urlWidth -iconWidth;

	$('#toolbar') // 昔の#modifiedがfloatで下にいかないよう1040px以上必要だった
		.width( (windowWidth <1040)? 1040 : windowWidth );
	$('#folderbox')
		.width( folderboxWidth )
		.height( folderboxHeight );
	$('#border')
		.height( folderboxHeight );
	$('#itembox')
		.width( itemboxWidth )
		.height( folderboxHeight );
	// アイテムヘッダのボーダーと合うよう適当に増減して設定
	$('#itemhead')
		.width( itemsWidth )
		.find('.title').width( titleWidth ).end()
		.find('.url').width( urlWidth ).end()
		.find('.iconurl').width( iconWidth ).end()
		.find('.date').width( dateWidth -38 );			// -38px適当float対策
	$('#items')
		.width( itemsWidth )
		.find('.title').width( titleWidth -18 ).end()				// アイコンのぶん-18px
		.find('.url').width( urlWidth +4 ).end()					// itemborderのぶん-4px
		.find('.iconurl').width( iconWidth +4 ).end()				// itemborderのぶん-4px
		.find('.summary').width( urlWidth +iconWidth +14 ).end()	// 見た目で合うように+14px
		.find('.date').width( dateWidth -36);					// float対策適当-36px
});
$(document).on({
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
			$('#exit').click(); return false;
		case 46: // Delete
			if( ev.target.tagName !='INPUT' ){
				$('#delete').click();
				return false;
			}
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
if( IE && IE<9 ){
	// IE8ウィンドウ外ドラッグでイベントが来ない問題のよい解決策がないので、
	// ウィンドウ外に出たらドラッグやめたことにする。
	$(document).mouseleave(function(){ $(this).mouseup(); } );
}
// 変更保存リンク
$('#modified').click(function(){ treeSave(); });
// 終了
$('#exit').click(function(){
	if( tree.modified() ){
		Confirm({
			msg	:'変更が保存されていません。いま保存して次に進みますか？　「いいえ」で変更を破棄して次に進みます。'
			,width:380
			,yes:function(){ treeSave({ success:reload }); }
			,no :reload
		});
	}
	else reload();

	function reload(){ location.href = 'index.html'; }
});
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
				if( !name.length ){
					// 名前変更・テキスト選択
					edit( $item.children('.title')[0], {select:true} );
				}
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
$('#newitem').click(function(){
	// 選択フォルダID=folderXXならノードID=XX
	var url = $('#newurl').val();
	var node = tree.newURL( selectFolder.id.slice(6), url );
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
		if( url.length ){
			$.get(':analyze?'+url.myURLenc(),function(data){
				if( data.title.length ){
					data.title = HTMLdec( data.title );
					if( tree.nodeAttr( node.id, 'title', data.title ) >1 )
						$('#item'+node.id).find('.title').text( data.title );
				}
				if( data.icon.length ){
					if( tree.nodeAttr( node.id, 'icon', data.icon ) >1 )
						$('#item'+node.id).find('img').attr('src',data.icon).end().find('.iconurl').text(data.icon);
				}
			});
		}else{
			// URL編集
			edit( $item.children('.url')[0] );
		}
	},1);
	$('#newurl').val('');
});
$('#newurl').keypress(function(ev){
	switch( ev.which || ev.keyCode || ev.charCode ){
	case 13: $('#newitem').click(); return false;
	}
});
// すべて選択
$('#selectall').click(function(){
	// 選択フォルダ非アクティブ
	$(selectFolder).addClass('inactive');
	// アイテム全選択
	$('#items').children().each(function(){
		$(select=selectItemLast=this).removeClass('inactive').addClass('select').focus();
	});
});
// 削除
// TODO:削除後に選択フォルダ選択アイテムが初期化されてしまう。近いエントリを選択すべきか。
$('#delete').click(function(){
	if( select.id.indexOf('item')==0 ){
		// アイテム欄
		var hasFolder=false, titles='', count=0, ids=[];
		$('#items').children().each(function(){
			if( $(this).hasClass('select') ){
				if( $(this).hasClass('folder') ) hasFolder = true;
				titles += '　・' +$('.title',this).text() +'#BR#';
				ids.push(this.id.slice(4));
				count++;
			}
		});
		if( count ){
			if( tree.trashHas(ids[0]) ){
				// ごみ箱
				Confirm({
					msg		:((count>1)?count+'個の':'') +'アイテム#BR#' +titles +'を完全に消去します。'
					,width	:400
					,height	:count *21 +200
					,ok:function(){
						// ノードツリー変更
						tree.eraseNodes( ids );
						// 表示更新
						if( hasFolder ) folderTree({ clickID:selectFolder.id.slice(6) });
						else itemTable( tree.node(selectFolder.id.slice(6)) );
					}
				});
			}
			else{
				tree.moveChild( ids, tree.trash() );
				if( hasFolder ) folderTree({ clickID:selectFolder.id.slice(6) });
				else itemTable( tree.node(selectFolder.id.slice(6)) );
			}
		}
	}
	else{
		// フォルダツリー
		var nid = select.id.slice(6);
		if( tree.movable(nid) ){
			if( tree.trashHas(nid) ){
				Confirm({
					msg		:'フォルダ「' +$('.title',select).text() +'」を完全に消去します。'
					,width	:400
					,height	:200
					,ok		:function(){
						tree.eraseNode( nid );
						folderTree({ click0:true });
					}
				});
			}
			else{
				tree.moveChild( [nid], tree.trash() );
				folderTree({ clickID:nid });
			}
		}
	}
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
// スクロールで編集を確定して消す(編集ボックスはスクロールで動かないので)
$('#folderbox,#itembox').on('scroll',function(){ $('#editbox').trigger('decide'); });
// ボーダードラッグ
$('#border').mousedown(function(ev){
	$('#editbox').trigger('decide');
	var $folderbox = $('#folderbox');
	var $itembox = $('#itembox');
	var folderboxWidth = $folderbox.width();
	var itemboxWidth = $itembox.width();
	var downX = ev.pageX;
	$(document).on('mousemove.border',function(ev){
		var dx = ev.pageX -downX;
		var newFolderboxWidth = folderboxWidth +dx;
		var newItemboxWidth = itemboxWidth -dx;
		if( newFolderboxWidth >20 && newItemboxWidth >20 ){
			$folderbox.width( newFolderboxWidth );
			$itembox.width( newItemboxWidth );
		}
	})
	.one('mouseup',function(){
		$(document).off('mousemove.border');
		// TODO:位置保存する…？
	});
});
// アイテム欄項目ヘッダのボーダー
$('.itemborder').mousedown(function(ev){
	$('#editbox').trigger('decide');
	var $attrhead = $(this).prev();				// クリックしたボーダの左側の項目ヘッダ(.title/.url/.iconurl)
	var $lasthead = $('#itemhead span').last();	// 右端の項目ヘッダ(.date)
	var $attr='', $smry='';
	if( $attrhead.hasClass('title') ){
		$attr = $('#items').find('.title');
	}else{
		$attr = $('#items').find('.'+$attrhead.attr('class'));
		$smry = $('#items').find('.summary');
	}
	var $last = $('#items').find('.'+$lasthead.attr('class'));
	var attrheadWidth = $attrhead.width();
	var lastheadWidth = $lasthead.width();
	var attrWidth = $attr.length? $attr.width() : 0;
	var smryWidth = $smry.length? $smry.width() : 0;
	var lastWidth = $last.length? $last.width() : 0;
	var downX = ev.pageX;
	$(document).on('mousemove.itemborder',function(ev){
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
		$(document).off('mousemove.itemborder');
		// TODO:位置保存する…？
	});
});
// アイテム欄下余白から矩形選択
$('#itembox').mousedown(function(ev){
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
			$items.children().each(function(){
				$(this).removeClass('inactive');
			});
		}else{
			// 選択なし
			selectItemClear();
		}
		itemSelectStart( null, downX, downY );
	}
});
// 矩形選択
// TODO:アイテム欄の上下自動スクロール
function itemSelectStart( element, downX, downY ){
	// 変更を反映
	$('#editbox').trigger('decide');
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
	$(document).on('mousemove.selectbox',function(ev){
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
				item.selected? item.$.removeClass('select') : item.$.addClass('select');
			}
			else{
				// 矩形外は元通り
				item.selected? item.$.addClass('select') : item.$.removeClass('select');
			}
		}
	})
	.one('mouseup',function(){
		$(document).off('mousemove.selectbox');
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
			$(document.body).css('padding-top',0);
			$(window).resize();
			if( arg && arg.success ) arg.success();
		}
	});
}
// マウスイベント
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
	// 変更を反映
	$('#editbox').trigger('decide');
	// イベント間通知
	ev.data.itemID = this.id;
	ev.data.itemNotify = '';
	ev.shiftKey = shiftKey || ev.shiftKey;
	// 選択フォルダ非アクティブ
	$(selectFolder).addClass('inactive');
	// 選択アイテムをアクティブに
	$('#items').children().each(function(){
		$(this).removeClass('inactive');
	});
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
			$('#items').children().each(function(){
				if( this.id==id.begin ) isTarget = true;
				isTarget? $(this).addClass('select') :$(this).removeClass('select');
				if( this.id==id.end ) isTarget = false;
			});
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
			var selectCount = function(children){
				var count=0;
				for( var i=children.length-1; i>=0; i-- ){
					if( $(children[i]).hasClass('select') ) count++;
				}
				return count;
			}( $('#items').children() );
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
	// 変更を反映
	$('#editbox').trigger('decide');
	if( tree.movable( this.id.slice(6) ) ){
		// ドラッグ開始
		itemDragStart( this, ev.pageX, ev.pageY );
	}
	// TODO:[IE8]なぜかエラー発生させると画像アイコンドラッグ可能になるが、
	// ウィンドウ外ドラッグができなく(mousemoveが発生しなく)なる。
	// 他に適切な対策はないのか？
	if( IE && IE<9 )xxxxx;
}
function itemDragStart( element, downX, downY ){
	// スクロール制御準備
	var folderbox = document.getElementById('folderbox');
	var itembox = document.getElementById('itembox');
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
	var scrolling = null;
	// スクロール関数
	function scroller( element, value ){
		var old = element.scrollTop;
		element.scrollTop += value;
		if( old==element.scrollTop ){
			clearInterval( scrolling );
			scrolling = null;
		}
	}
	// イベント
	$(document).on('mousemove.itemdrag',function(ev){
		if( (Math.abs(ev.pageX-downX) +Math.abs(ev.pageY-downY)) >9 ){
			// ある程度カーソル移動したらドラッグ開始
			draggie = element;
			// ドラッグ中スタイル適用
			if( draggie.id.indexOf('item')==0 ){
				// アイテム欄でドラッグ
				dragitem = { ids:[], itemcount:0, foldercount:0 };
				$('#items').children().each(function(){
					if( $(this).hasClass('select') ){
						$(this).addClass('draggie');
						dragitem.ids.push( this.id.slice(4) );
						if( $(this).hasClass('folder') )
							dragitem.foldercount++;
						else
							dragitem.itemcount++;
					}
				});
			}else{
				// フォルダツリーでドラッグ
				$(draggie).addClass('draggie');
				dragitem = { ids:[ draggie.id.slice(6) ], foldercount:1 };
			}
			// ドラッグボックス表示
			// <img>タグは$('img',draggie).html()で取れないの？
			$('#dragbox').empty().text( $('.title',draggie).text() )
			.prepend( $('<img class=icon>').attr('src', $('img',draggie).attr('src')) )
			.css({ left:ev.pageX+5, top:ev.pageY+5 }).show();
			// イベント再登録
			$(document).off('mousemove.itemdrag').on('mousemove.itemdrag',function(ev){
				// ドラッグボックス移動
				$('#dragbox').css({ left:ev.pageX+5, top:ev.pageY+5 });
				// ドラッグ中に上端/下端に近づいたらスクロールさせる
				if( ev.pageX >=folderTop.X0 && ev.pageX <=folderTop.X1 ){
					if( ev.pageY >=folderTop.Y0 && ev.pageY <=folderTop.Y1 ){
						//$debug.text('フォルダ欄で上スクロール');
						if( !scrolling ) scrolling = setInterval(function(){scroller(folderbox,-30);},100);
					}
					else if( ev.pageY >=folderBottom.Y0 && ev.pageY <=folderBottom.Y1 ){
						//$debug.text('フォルダ欄で下スクロール');
						if( !scrolling ) scrolling = setInterval(function(){scroller(folderbox,30);},100);
					}
					else{
						//$debug.text('スクロールなし');
						if( scrolling ){
							clearInterval( scrolling );
							scrolling = null;
						}
					}
				}
				else if( ev.pageX >=itemTop.X0 && ev.pageX <= itemTop.X1 ){
					if( ev.pageY >=itemTop.Y0 && ev.pageY <=itemTop.Y1 ){
						//$debug.text('アイテム欄で上スクロール');
						if( !scrolling ) scrolling = setInterval(function(){scroller(itembox,-30);},100);
					}
					else if( ev.pageY >=itemBottom.Y0 && ev.pageY <=itemBottom.Y1 ){
						//$debug.text('アイテム欄で下スクロール');
						if( !scrolling ) scrolling = setInterval(function(){scroller(itembox,30);},100);
					}
					else{
						//$debug.text('スクロールなし');
						if( scrolling ){
							clearInterval( scrolling );
							scrolling = null;
						}
					}
				}
				else{
					//$debug.text('スクロールなし');
					if( scrolling ){
						clearInterval( scrolling );
						scrolling = null;
					}
				}
			});
		}
	})
	.one('mouseup',function(ev){
		// スクロール制御停止
		if( scrolling ){
			clearInterval( scrolling );
			scrolling = null;
		}
		// イベント解除
		$(document).off('mousemove.itemdrag');
		// ドラッグ解除
		$('#dragbox').hide();
		if( draggie ){
			if( draggie.id.indexOf('item')==0 ){
				// アイテム欄でドラッグ
				$('#items').children().each(function(){
					$(this).removeClass('draggie');
				});
			}else{
				// フォルダツリーでドラッグ
				$(draggie).removeClass('draggie');
			}
			draggie = null;
			dragitem = {};
		}
	});
}
function itemMouseMove(ev){
	if( draggie ){
		// ドラッグ先が自分の時は何もしない
		if( draggie.id==this.id ) return;
		var $this = $(this);
		// 複数選択ドラッグアイテムどうしは何もしない(ドロップ不可)
		if( draggie.id.indexOf('item')==0 && this.id.indexOf('item')==0 && $this.hasClass('select') ) return;
		// ドロップ要素スタイル適用
		$this.removeClass('dropTop dropBottom dropIN');
		// エレメント上端からマウスの距離 Y は 0～22くらいの範囲
		var Y = ev.pageY - $this.offset().top;
		if( draggie.id.indexOf('item')==0 ){
			// アイテム欄から…
			if( dragitem.itemcount ){
				// アイテム(ブックマーク)を含む単選択か複数選択を…
				if( this.id.indexOf('item')==0 ){
					// アイテム欄の…
					if( $this.hasClass('folder') ) SiblingAndChild(); // フォルダへドラッグ
					else SiblingOnly(); // アイテムへドラッグ
				}else{
					// フォルダツリーへドラッグ
					ChildOnly();
				}
			}else if( dragitem.foldercount ){
				// フォルダのみを…
				if( this.id.indexOf('item')==0 ){
					// アイテム欄の…
					if( $this.hasClass('folder') ) SiblingAndChild(); // フォルダへドラッグ
					else SiblingOnly(); // アイテムへドラッグ
				}else{
					// フォルダツリーの…
					if( tree.movable( this.id.slice(6) ) ) SiblingAndChild(); // その他フォルダへドラッグ
					else ChildOnly(); // トップフォルダ・ごみ箱へドラッグ
				}
			}
		}else{
			// フォルダツリーから…
			if( this.id.indexOf('item')==0 ){
				// アイテム欄の…
				if( $this.hasClass('folder') ) SiblingAndChild(); // フォルダへドラッグ
				else SiblingOnly(); // アイテムへドラッグ
			}else{
				// フォルダツリーの…
				if( tree.movable( this.id.slice(6) ) ) SiblingAndChild(); // その他フォルダへドラッグ
				else ChildOnly(); // トップフォルダ・ごみ箱へドラッグ
			}
		}
	}

	function SiblingAndChild(){
		if( Y <6 )
			$this.addClass('dropTop');
		else if( Y >18 )
			$this.addClass('dropBottom');
		else
			$this.addClass('dropIN');
	}
	function SiblingOnly(){
		if( Y <12 )
			$this.addClass('dropTop');
		else
			$this.addClass('dropBottom');
	}
	function ChildOnly(){
		$this.addClass('dropIN');
	}
}
function itemMouseLeave(){
	if( draggie ) $(this).removeClass('dropTop dropBottom dropIN');
}
function itemMouseUp(ev){
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
			//$debug.text(dragitem.ids+' が、'+this.id+' にdropTopされました');
			tree.moveSibling( dragitem.ids, this.id.replace(/^\D*/,'') );
		}
		else if( $this.hasClass('dropBottom') ){
			//$debug.text(dragitem.ids+' が、'+this.id+' にdropBottomされました');
			tree.moveSibling( dragitem.ids, this.id.replace(/^\D*/,''), true );
		}
		else if( $this.hasClass('dropIN') ){
			//$debug.text(dragitem.ids+' が、'+this.id+' にdropINされました');
			tree.moveChild( dragitem.ids, this.id.replace(/^\D*/,'') );
		}
		$this.removeClass('dropTop dropBottom dropIN');
		// 表示更新
		if( dragitem.foldercount >0 ) folderTree({ clickID:selectFolder.id.slice(6) });
		else itemTable( tree.node(selectFolder.id.slice(6)) );
		// なぜかIE8でdragbox消えずdropXXXスタイル解除されない。
		// $(document).mouseup()が実行されていないような挙動にみえるので
		// 実行したらとりあえず問題ないように見える。
		if( IE && IE<9 ) $(document).mouseup();
	}
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
			edit( document.elementFromPoint( ev.pageX, ev.pageY ) );
			return;
		}
	}
}
function itemDblClick(){
	if( $(this).find('.summary').length ){
		// フォルダはフォルダ開く
		// 自身ID=itemXXならフォルダID=folderXX
		$('#folder'+this.id.slice(4)).click();
	}
	else{
		// ブックマークならURL開く
		var url = $(this).find('.url').text();
		if( url.length ) window.open( url );
	}
	// 編集ボックス隠す
	// TODO:[Chrome]ブックマークトップのフォルダをダブルクリックすると
	// 左上に編集ボックスが出現してしまうしかも幅がやたら長い。他の階層
	// にあるフォルダなら発生しないので詳細不明だが、とりあえずsetTimeout
	// で実行するようにしたら解消した。dblclickの後にclickが発生してしまう
	// のか？でもトップノードとその他フォルダで挙動が違うのはなぜ？？？
	//$('#editbox').off().hide();
	//$('#editbox').trigger('decide');
	setTimeout(function(){$('#editbox').trigger('decide');},3);
	return false;
}
// TODO:左ボタンドラッグと右ボタンドラッグを区別していないので、右ドラッグした時に
// たまたまカーソル下に要素があればコンテキストメニューが出て、なければ出ないという
// 挙動になる。右ドラッグ用メニュー「ここに移動」「ここにコピー」などを作るべき？
function itemContextMenu(ev){
	var item = ev.target;
	while( !$(item).hasClass('item') ){
		if( !item.parentNode ) return;
		item = item.parentNode;
	}
	var $menu = $('#contextmenu').width(200);
	var $box = $menu.children('div').empty();
	var iopen = $(item).find('img').attr('src');
	// 開く
	if( $(item).hasClass('folder') ){
		// フォルダ
		$box.append($('<a><img src='+iopen+'>フォルダを開く</a><hr>').click(function(){
			$menu.hide();
			$(item).dblclick();
		}));
	}
	else{
		// ブックマーク
		$box.append($('<a><img src='+iopen+'>URLを開く</a><hr>').click(function(){
			$menu.hide();
			var url = $(item).find('.url').text();
			if( url.length ) window.open( url );
		}));
		$box.append($('<a><img src=question.png>タイトル/アイコンを取得</a><hr>').click(function(){
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
								if( tree.nodeAttr( item.id.slice(4), 'title', $title.val() ) >1 )
									$(item).find('.title').text( $title.val() );
							})
						)
					)
				).append(
					$('<tr><th>アイコン</th></tr>').append(
						$('<td></td>').append( $icon ).append( $iconurl )
					).append(
						$('<th></th>').append(
							$('<a>反映</a>').button().click(function(){
								if( tree.nodeAttr( item.id.slice(4), 'icon', $iconurl.val() ) >1 )
									$(item).find('img').attr('src',$icon.attr('src')).end().find('.iconurl').text($iconurl.val());
							})
						)
					)
				).append(
					$('<tr></tr>').append(
						$('<td id=anmove colspan=3></td>').append(
							$('<a title="前のアイテム">&nbsp;&nbsp;▲&nbsp;&nbsp;</a>').button().click(function(){
								var $prev = $(item).prev();
								while( $prev.hasClass('folder') ) $prev = $prev.prev();
								if( $prev.hasClass('item') ){
									item = $prev[0];
									itemmove();
								}
							})
						).append(
							$('<a title="次のアイテム">&nbsp;&nbsp;▼&nbsp;&nbsp;</a>').button().click(function(){
								var $next = $(item).next();
								while( $next.hasClass('folder') ) $next = $next.next();
								if( $next.hasClass('item') ){
									item = $next[0];
									itemmove();
								}
							})
						)
					)
				)
			).dialog({
				title	:'タイトル/アイコンを取得'
				,modal	:true
				,width	:560
				,height	:220
				,close	:function(){ $(this).dialog('destroy'); }
			});
			analyze();
			function analyze(){
				var url = $(item).find('.url').text();
				$.ajax({
					url:':analyze?'+url.myURLenc()
					,error:function(){
						if( url==$(item).find('.url').text() ){
							$title.val('');
							$icon.attr('src','item.png');
							$iconurl.val('');
						}
					}
					,success:function(data){
						if( url==$(item).find('.url').text() ){
							$title.val( HTMLdec( data.title ||'' ) );
							$icon.attr('src',data.icon ||'item.png');
							$iconurl.val( data.icon ||'' );
						}
					}
				});
			}
			function itemmove(){
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
	// 削除
	var idelete = tree.trashHas( item.id.slice(4) )? 'delete.png' : 'trash.png';
	$box.append($('<a><img src='+idelete+'>削除</a>').click(function(){
		$menu.hide();
		$('#delete').click();
	}));
	// 表示
	$menu.css({
		left: (($(window).width() -ev.pageX) < $menu.width())? ev.pageX -$menu.width() : ev.pageX
		,top: (($(window).height() -ev.pageY) < $menu.height())? ev.pageY -$menu.height() : ev.pageY
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
	if( nid==tree.trash().id ){
		$box.append($('<a><img src=delete.png>ごみ箱を空にする</a>').click(function(){
			$menu.hide();
			onContextHide();
			Confirm({
				msg		:'ごみ箱の全アイテム・フォルダを完全に消去します。'
				,width	:400
				,height	:180
				,ok		:function(){
					var selectTrash = tree.trashHas( selectFolder.id.slice(6) );
					tree.trashEmpty();
					if( selectTrash ) folderTree({ click0:true });
					else folderTree({ clickID:selectFolder.id.slice(6) });
				}
			});
		}));
		$menu.width(150);
	}
	else if( tree.movable(nid) ){
		if( tree.trashHas(nid) ){
			$box.append($('<a><img src=delete.png>削除</a>').click(function(){
				$menu.hide();
				onContextHide();
				Confirm({
					msg		:'フォルダ「' +$('.title',folder).text() +'」を完全に消去します。'
					,width	:400
					,height	:200
					,ok		:function(){
						tree.eraseNode( nid );
						if( folder==selectFolder ) folderTree({ click0:true });
						else folderTree({ clickID:selectFolder.id.slice(6) });
					}
				});
			}));
		}
		else{
			$box.append($('<a><img src=trash.png>削除</a>').click(function(){
				$menu.hide();
				onContextHide();
				tree.moveChild( [nid], tree.trash() );
				folderTree({ clickID:selectFolder.id.slice(6) });
			}));
		}
		$menu.width(100);
	}
	else return; // ルートノード
	// ターゲットフォルダ色つけ
	$(folder).addClass('contexted');
	onContextHide = function(){
		$(folder).removeClass('contexted');
		onContextHide = null;
	};
	// 表示
	$menu.css({
		left: (($(window).width() -ev.pageX) < $menu.width())? ev.pageX -$menu.width() : ev.pageX
		,top: (($(window).height() -ev.pageY) < $menu.height())? ev.pageY -$menu.height() : ev.pageY
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
	$('#items').children().each(function(){
		$(this).removeClass('select inactive');
	});
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
					// 反映カスタムイベント
					decide:function(){
						// ノードツリー反映
						var nodeid = element.parentNode.id.replace(/^\D*/,'');
						var attrName = (element.className=='iconurl')? 'icon' : element.className;
						var value = $(this).val();
						if( tree.nodeAttr( nodeid, attrName, value ) >1 ){
							// 成功、DOM反映
							$e.text( value );
							switch( attrName ){
							case 'title':
								// アイテム欄のフォルダの場合、フォルダツリーも更新
								// TODO:スクロールが初期化されてしまうフォルダツリー欄の表示状態維持すべき
								if( $(element.parentNode).hasClass('item folder') ) folderTree();
								break;
							case 'url':
								if( value.length ){
									// 新品アイテムはURL取得解析する
									var node = tree.node( nodeid );
									if( node.title=='新規ブックマーク' ){
										$.get(':analyze?'+value.myURLenc(),function(data){
											if( data.title.length && node.title=='新規ブックマーク' ){
												data.title = HTMLdec( data.title );
												if( tree.nodeAttr( nodeid, 'title', data.title ) >1 )
													$('#item'+nodeid).find('.title').text( data.title );
											}
											if( data.icon.length && (!node.icon|| !node.icon.length) ){
												if( tree.nodeAttr( nodeid, 'icon', data.icon ) >1 )
													$('#item'+nodeid).find('img').attr('src',data.icon).end().find('.iconurl').text(data.icon);
											}
										});
									}
								}
								break;
							case 'icon':
								$('#item'+nodeid).find('img').attr('src',(value.length?value:'item.png'));
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
						$(element.parentNode).focus();
						$(this).off().hide();
					}
					// TAB,Enterで反映
					,keydown:function(ev){
						switch( ev.which || ev.keyCode || ev.charCode ){
						case 9: $(this).trigger('decide'); return false; // TAB
						}
					}
					,keypress:function(ev){
						switch( ev.which || ev.keyCode || ev.charCode ){
						case 13: $(this).trigger('decide'); return false; // Enter
						}
					}
				}).show().focus();
				if( opt && opt.select ) $editbox.select();
			},10);
			break;
		case 'date':
			// 作成日時は変更禁止、値コピーのためボックス表示。
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
					// なにもしない消えるだけ
					decide:function(){
						$(element.parentNode).focus();
						$(this).off().hide();
					}
					// TAB
					,keydown:function(ev){
						switch( ev.which || ev.keyCode || ev.charCode ){
						case 9: $(this).trigger('decide'); return false;
						}
					}
					// Enter
					,keypress:function(ev){
						switch( ev.which || ev.keyCode || ev.charCode ){
						case 13: $(this).trigger('decide'); return false;
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
	var box = document.getElementById( boxid );
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
		var maxWidth = $(window).width() -100;
		if( arg.width > maxWidth ) arg.width = maxWidth;
		else if( arg.width < 300 ) arg.width = 300;
		opt.width = arg.width;
	}
	if( arg.height ){
		var maxHeight = $(window).height() -100;
		if( arg.height > maxHeight ) arg.height = maxHeight;
		else if( arg.height < 150 ) arg.height = 150;
		opt.height = arg.height;
	}

	$('#dialog').html( HTMLenc( arg.msg ).replace(/#BR#/g,'<br>') ).dialog( opt );
}
function Alert( msg ){
	var opt ={
		title		:'通知'
		,modal		:true
		,width		:360
		,height		:160
		,close		:function(){ $(this).dialog('destroy'); }
		,buttons	:{ 'O K':function(){ $(this).dialog('destroy'); } }
	};
	$('#dialog').html( HTMLenc( msg ).replace(/#BR#/g,'<br>') ).dialog( opt );
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
String.prototype.myURLenc = function(){ return this.replace(/#!/g,'%23!'); };

})($);
