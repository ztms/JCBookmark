// vim:set ts=4:vim modeline
// TODO:リンク切れ検査機能。単にGETして200/304/404を緑/黄/赤アイコンで表示すればいいかな。
// TODO:パネル色分け。既定のセットがいくつか選べて、さらにRGBかHSVのバーの任意色って感じかな。
// TODO:検索・ソート機能。う～んまずは「最近登録したものから昇順に」かな・・結果は別ウィンドウかな。
// TODO:一括でパネル開閉
(function($){
'use strict';
/*
var $debug = $('<div></div>').css({
		position:'fixed'
		,left:'0'
		,top:'0'
		,width:'200px'
		,background:'#fff'
		,border:'1px solid #000'
		,padding:'2px'
		,'font-size':'12px'
}).appendTo(document.body);
var start = new Date(); // 測定
*/
var oStr = Object.prototype.toString;						// 型判定
var IE = window.ActiveXObject ? document.documentMode : 0;	// IE判定
$.ajaxSetup({
	// ブラウザキャッシュ(主にIE)対策 http://d.hatena.ne.jp/hasegawayosuke/20090925/p1
	beforeSend:function(xhr){
		xhr.setRequestHeader('If-Modified-Since','Thu, 01 Jun 1970 00:00:00 GMT');
	}
});
var $window = $(window);
var $document = $(document);
var $wall = $('#wall');
var $sidebar = $('#sidebar');
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
				$wall.css('padding-top','22px');
				$('.itempop').each(function(){ if( this.offsetTop<22 ) $(this).css('top',22); });
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
	// 指定IDのchildに接ぎ木
	,mount:function( subtree ){
		// ノードIDつけて
		(function callee( node ){
			node.id = tree.root.nextid++;
			if( node.child )
				for( var i=0, n=node.child.length; i<n; i++ ) callee( node.child[i] );
		}( subtree ));
		// トップノード(固定)child配列に登録
		tree.top().child.push( subtree ); // 最後に
		tree.modified(true);
		return tree;
	}
	// 指定ノードIDを持つノードオブジェクト(ごみ箱は探さない)
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
		}( tree.top() );
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
	// 新規アイテム作成
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
	// 属性変更
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
				}( tree.root.child ));
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
				}( tree.root.child ));
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
// パネルオプション
var option = {
	data:{
		// 空(規定値ではない)を設定
		page	:{ title:null }
		,color	:{ css	:'' }
		,wall	:{ margin:'' }
		,font	:{ size	:-1, css:'' }
		,icon	:{ size	:-1 }
		,column	:{ count:-1 }
		,panel	:{
			layout	:{}
			,status	:{}
			,margin	:{ top:-1, left:-1 }
			,width	:-1
		}
		,autoshot:false
	}
	,_modified:false
	,modified:function( on ){
		if( arguments.length ){
			option._modified = on;
			if( on ){
				$('#modified').show();
				$wall.css('padding-top','22px');
			}
			return option;
		}
		return option._modified;
	}
	,init:function( data ){
		var od = option.data;
		if( 'page' in data && 'title' in data.page ) od.page.title = data.page.title;
		if( 'color' in data && 'css' in data.color ) od.color.css = data.color.css;
		if( 'wall' in data && 'margin' in data.wall ) od.wall.margin = data.wall.margin;
		if( 'font' in data ){
			if( 'size' in data.font ) od.font.size = data.font.size;
			if( 'css' in data.font ) od.font.css = data.font.css;
		}
		if( 'icon' in data && 'size' in data.icon ) od.icon.size = data.icon.size;
		if( 'column' in data && 'count' in data.column ) od.column.count = data.column.count;
		if( 'panel' in data ){
			if( 'layout' in data.panel ) od.panel.layout = data.panel.layout;
			if( 'status' in data.panel ) od.panel.status = data.panel.status;
			if( 'margin' in data.panel ){
				if( oStr.call(data.panel.margin)==='[object Object]' ){
					// v1.8
					if( 'top' in data.panel.margin ) od.panel.margin.top = data.panel.margin.top;
					if( 'left' in data.panel.margin ) od.panel.margin.left = data.panel.margin.left;
				}
				else{
					// v1.7まで
					od.panel.margin.top = od.panel.margin.left = data.panel.margin|0;
				}
			}
			if( 'width' in data.panel ) od.panel.width = data.panel.width;
		}
		if( 'autoshot' in data ){
			od.autoshot = data.autoshot;
			$('#autoshot').attr('checked', data.autoshot );
		}
		return option;
	}
	,merge:function( data ){
		if( 'page' in data && 'title' in data.page ) option.page.title( data.page.title );
		if( 'color' in data && 'css' in data.color ) option.color.css( data.color.css );
		if( 'wall' in data && 'margin' in data.wall ) option.wall.margin( data.wall.margin );
		if( 'font' in data ){
			if( 'size' in data.font ) option.font.size( data.font.size );
			if( 'css' in data.font ) option.font.css( data.font.css );
		}
		if( 'icon' in data && 'size' in data.icon ) option.icon.size( data.icon.size );
		if( 'column' in data && 'count' in data.column ) option.column.count( data.column.count );
		if( 'panel' in data ){
			if( 'layout' in data.panel ) option.panel.layout( data.panel.layout );
			if( 'status' in data.panel ) option.panel.status( data.panel.status );
			if( 'margin' in data.panel ){
				if( oStr.call(data.panel.margin)==='[object Object]' ){
					// v1.8
					if( 'top' in data.panel.margin ) option.panel.margin.top( data.panel.margin.top );
					if( 'left' in data.panel.margin ) option.panel.margin.left( data.panel.margin.left );
				}
				else{
					// v1.7まで
					option.panel.margin.top( data.panel.margin|0 );
					option.panel.margin.left( data.panel.margin|0 );
				}
			}
			if( 'width' in data.panel ) option.panel.width( data.panel.width );
		}
		if( 'autoshot' in data ) option.autoshot( data.autoshot );
		return option;
	}
	,clear:function(){
		var od = option.data;
		if( od.page.title !=null ) option.page.title(null);
		if( od.color.css !='' ) option.color.css('');
		if( od.wall.margin !='' ) option.wall.margin('');
		if( od.font.size != -1 ) option.font.size(-1);
		if( od.font.css !='' ) option.font.css('');
		if( od.icon.size != -1 ) option.icon.size(-1);
		if( od.column.count != -1 ) option.column.count(-1);
		if( od.panel.layout !={} ) option.panel.layout({});
		if( od.panel.status !={} ) option.panel.status({});
		if( od.panel.margin.top != -1 ) option.panel.margin.top(-1);
		if( od.panel.margin.left != -1 ) option.panel.margin.left(-1);
		if( od.panel.width != -1 ) option.panel.width(-1);
		if( od.autoshot !=false ) option.autoshot(false);
		return option;
	}
	,page:{
		title:function( val ){
			if( arguments.length ){
				option.data.page.title = val;
				option.modified(true);
				return option;
			}
			var page = option.data.page;
			// 一度目の参照時に規定値を設定
			if( page.title==null ) page.title = 'ブックマーク';
			return page.title;
		}
	}
	,color:{
		css:function( val ){
			if( arguments.length ){
				option.data.color.css = val;
				option.modified(true);
				return option;
			}
			var color = option.data.color;
			// 一度目の参照時に規定値を設定
			if( color.css=='' ) color.css = 'black.css';
			return color.css;
		}
	}
	,wall:{
		margin:function( val ){
			if( arguments.length ){
				option.data.wall.margin = val;
				option.modified(true);
				return option;
			}
			var wall = option.data.wall;
			// 一度目の参照時に規定値を設定
			if( wall.margin=='' ) wall.margin = 'auto';
			return wall.margin;
		}
	}
	,font:{
		size:function( val ){
			if( arguments.length ){
				option.data.font.size = val |0;
				option.modified(true);
				return option;
			}
			var font = option.data.font;
			// 一度目の参照時に規定値を設定
			if( font.size<0 ) font.size = 13;	// px
			return font.size;
		}
		,css:function( val ){
			if( arguments.length ){
				option.data.font.css = val;
				option.modified(true);
				return option;
			}
			var font = option.data.font;
			// 一度目の参照時に規定値を設定
			if( font.css=='' ) font.css = 'gothic.css';
			return font.css;
		}
	}
	,icon:{
		size:function( val ){
			if( arguments.length ){
				option.data.icon.size = val |0;
				option.modified(true);
				return option;
			}
			var icon = option.data.icon;
			// 一度目の参照時に規定値を設定
			if( icon.size<0 ) icon.size = 0;	// px
			return icon.size;
		}
	}
	,column:{
		count:function( val ){
			if( arguments.length ){
				option.data.column.count = val |0;
				option.modified(true);
				return option;
			}
			var column = option.data.column;
			// 一度目の参照時に規定値を設定
			if( column.count<0 ) column.count = ($window.width() /230)|0;
			return column.count;
		}
	}
	,panel:{
		layout:function( val ){
			if( arguments.length ){
				option.data.panel.layout = val;
				option.modified(true);
				return option;
			}
			return option.data.panel.layout;
		}
		,layouted:function(){
			// パネル配置(どのカラム=段にどのパネルが入っているか)記憶
			// 形式：JSON形式で、キーがカラム(段)ID、値がパネルIDの配列
			// 例) { co0:[1,22,120,45], co1:[3,5,89], ... }
			var layout = {};
			$('.panel').each(function(){
				var id = { column:this.parentNode.id, panel:this.id };
				if( !(id.column in layout) ) layout[id.column] = [];
				layout[id.column].push( id.panel );
			});
			if( JSON.stringify(option.panel.layout()) !=JSON.stringify(layout) )
				option.panel.layout( layout );
		}
		,status:function( val ){
			if( arguments.length ){
				option.data.panel.status = val;
				// パネルの開閉でいちいち「保存しろ」メッセージが出るのは使いづらい？
				//option.modified(true);
				// なにもメッセージ出さず自動保存してしまう方がいいかな？単純に常に保存
				// するとインポートして「差し替え」した時にindex.jsonが更新されてしまう
				// ので、保存リンクが出ていない時だけ勝手に保存する。
				// TODO:開閉操作の実行順と、サーバ側のファイル更新実行順は同じになるよう
				// 制御はしていないので、接続が不安定などの理由でひょっとしたら逆転して
				// しまう場合がある？
				if( option.modified() ) return option;
				if( tree.modified() ){ option.modified(true); return option; }
				option.save({ error:function(){option.modified(true);} });
				return option;
			}
			return option.data.panel.status;
		}
		,margin:{
			left:function( val ){
				if( arguments.length ){
					option.data.panel.margin.left = val |0;
					option.modified(true);
					return option;
				}
				var margin = option.data.panel.margin;
				// 一度目の参照時に規定値を設定(px)
				if( margin.left<0 ) margin.left = 1;
				return margin.left;
			}
			,top:function( val ){
				if( arguments.length ){
					option.data.panel.margin.top = val |0;
					option.modified(true);
					return option;
				}
				var margin = option.data.panel.margin;
				// 一度目の参照時に規定値を設定(px)
				if( margin.top<0 ) margin.top = 1;
				return margin.top;
			}
		}
		,width:function( val ){
			if( arguments.length ){
				option.data.panel.width = val |0;
				option.modified(true);
				return option;
			}
			var panel = option.data.panel;
			// 一度目の参照時に規定値を設定(px)
			if( panel.width<0 ) panel.width = (($window.width() -27) /option.column.count() -option.panel.margin.left())|0;
			return panel.width;
		}
	}
	,autoshot:function( val ){
		if( arguments.length ){
			option.data.autoshot = val;
			$('#autoshot').attr('checked', val );
			option.modified(true);
			return option;
		}
		return option.data.autoshot;
	}
	// オプション取得：エラー無視
	,load:function( onComplete ){
		$.ajax({
			dataType:'json'
			,url	:'index.json'
			,success:function(data){ option.init( data ); }
			,complete:onComplete
		});
		return option;
	}
	// オプション保存
	,save:function( arg ){
		$.ajax({
			type	:'put'
			,url	:'index.json'
			,data	:JSON.stringify( option.data )
			,error	:function(xhr){
				Alert('保存できません:'+xhr.status+' '+xhr.statusText);
				if( arg.error ) arg.error();
			}
			,success:function(){
				option.modified(false);
				if( arg.success ) arg.success();
			}
		});
		return option;
	}
};
// ブックマークデータ取得
(function(){
	var option_ok = false;
	var tree_ok = false;
	tree.load(function(){
		tree_ok = true;
		if( option_ok ) paneler( tree.top(), setEvents );
	});
	option.load(function(){
		option_ok = true;
		if( tree_ok ) paneler( tree.top(), setEvents );
	});
})();
// カラム生成関数
var $columnBase = $('<div class=column></div>');
function $column( id ){
	var $e = $columnBase.clone();
	$e[0].id = id;
	return $e;
}
// パネル生成関数
var $panelBase = $('<div class=panel><div class=itembox></div></div>')
	.prepend(
		$('<div class=title><img class=icon src=folder.png><span></span></div>')
		.prepend( $('<img class=pen src=pen.png title="パネル編集">') )
		.prepend( $('<img class=plusminus src=minus.png title="閉じる">') )
	);
function $newPanel( node ){
	var $p = $panelBase.clone(true);
	$p[0].id = node.id;
	$p.find('span').text( node.title );
	$p.find('.plusminus')[0].id = 'btn'+node.id;
	return $p;
}
// パネルアイテム生成関数
var $itemBase = $('<a class=item target="_blank"><img class=icon><span></span></a>');
function $newItem( node ){
	var $i = $itemBase.clone().attr({
		id		: node.id
		,href	: node.url
		,title	: node.title
	});
	$i.find('img').attr('src', node.icon ||'item.png');
	$i.find('span').text( node.title );
	return $i;
}
// margin,padding覚書
// |<------------------ #wall ---------------------->|
// |<-- .column width --->|<-- .column width --->| p |
// +----------------------+----------------------+ a |
// |     .panel margin    |     .panel margin    | d |
// |   +------------------+   +------------------+ d |
// |   |       panel      |   |      panel       | i |
// |   |------------------|   |------------------| n |
// |   |                  |   |                  | g |
// |   |                  |   |                  |   |
// |---+------------------+---+------------------+   |
var paneler = function(){
	var timer = null;	// setTimeoutID
	return function( nodeTop, postEvent ){
		clearTimeout( timer ); // 古いのキャンセル
		document.title = option.page.title();
		$('#colorcss').attr('href',option.color.css());
		$('#fontcss').attr('href',option.font.css());
		var fontSize = option.font.size();
		var iconSize = option.icon.size();
		var panelWidth = option.panel.width();
		var panelMarginTop = option.panel.margin.top();
		var panelMarginLeft = option.panel.margin.left();
		var columnCount = option.column.count();
		var columnWidth = panelWidth + panelMarginLeft +2;	// +2 適当たぶんボーダーぶん
		$wall.empty().width( columnWidth * columnCount ).css({
			'padding-right': panelMarginLeft +'px'
			,margin: option.wall.margin()
		});
		// カラム元要素
		$columnBase.width( columnWidth );
		// パネル元要素
		$panelBase.width( panelWidth ).css({
			'font-size': fontSize +'px'
			,margin: panelMarginTop +'px 0 0 ' +panelMarginLeft +'px'
		});
		$panelBase.find('.title span').css('vertical-align',(iconSize/2)|0);
		$panelBase.find('.icon').width( fontSize +3 +iconSize ).height( fontSize +3 +iconSize );
		$panelBase.find('.pen, .plusminus').width( fontSize +iconSize ).height( fontSize +iconSize );
		// パネルアイテム元要素
		$itemBase.find('span').css('vertical-align',(iconSize/2)|0 );
		$itemBase.find('.icon').width( fontSize +3 +iconSize ).height( fontSize +3 +iconSize );
		// カラム(段)生成
		var columns = {};
		for( var i=0; i<columnCount; i++ ){
			columns['co'+i] = {
				$e: $column( 'co'+i ).appendTo( $wall )
				,height: 0
			};
		}
		// float解除
		$wall.append('<br class=clear>');
		// 表示(チラツキ低減)
		$('body').css('visibility','visible');
		// レイアウト保存データのパネル配置
		// キーがカラム(段)ID、値がパネルIDの配列(上から順)の連想配列
		// 例) { co0:[1,22,120,45], co1:[3,5,89], ... }
		var panelLayout = option.panel.layout();
		var panelStatus = option.panel.status();
		var placeList = {}; // 配置が完了したパネルリスト: キーがパネルID、値はtrue
		var index = 0;		// 上の方に並ぶパネルから順に生成していくためのインデックス変数
		(function layouter(){
			var count=2;
			do{
				var layoutSeek = false;
				for( var coID in panelLayout ){
					var coN = panelLayout[coID];
					if( index < coN.length ){
						var node = tree.node( coN[index] );
						if( node ) panelCreate( node, coID );
						layoutSeek = true;
					}
				}
				index++; count--;
			}
			while( layoutSeek && count>0 );
			if( layoutSeek ) timer = setTimeout(layouter,0); else afterLayout();
		}());
		// パネル１つ生成配置
		function panelCreate( node, coID ){
			var column = ( arguments.length >1 )? columns[coID] : lowestColumn();
			var $p = $newPanel( node ).appendTo( column.$e );
			// パネル開閉状態反映: キーがボタンID、値が 0(開) または 1(閉)
			// 例) { btn1:1, btn9:0, btn45:0, ... }
			// パネルID=XXX は、ボタンID=btnXXX に対応
			var btnID = 'btn'+node.id;
			if( btnID in panelStatus && panelStatus[btnID]==1 ){
				// 閉パネル閉じ
				panelOpenClose( $p );
			}
			else{
				// 開パネルアイテム追加
				var $box = $p.find('.itembox').empty();
				for( var i=0, child=node.child, n=child.length; i<n; i++ ){
					if( !child[i].child )
						$box.append( $newItem( child[i] ) );
				}
			}
			// カラム高さ
			column.height += $p.height();
			// 完了
			placeList[node.id] = true;
		}
		// 高さがいちばん低いカラムオブジェクトを返す
		function lowestColumn(){
			var target = null;
			for( var id in columns ){
				if( !target )
					target = columns[id];
				else if( target.height > columns[id].height )
					target = columns[id];
			}
			return target;
		}
		// レイアウト反映後、残りのパネル配置
		function afterLayout(){
			var nodeList = [];	// 未配置ノードオブジェクト配列
			(function lister( node ){
				if( !(node.id in placeList) ){
					nodeList.push( node );
				}
				for( var i=0, n=node.child.length; i<n; i++ ){
					if( node.child[i].child ){
						lister( node.child[i] );
					}
				}
			}( nodeTop ));
			var index=0, length=nodeList.length;
			(function placer(){
				var count=5;
				while( index < length && count>0 ){
					panelCreate( nodeList[index] );
					index++; count--;
				}
				if( index < length ) timer = setTimeout(placer,0); else afterPlaced();
			}());
		}
		// 全パネル配置後
		function afterPlaced(){
			// 新規URL投入BOX作成
			$('#'+nodeTop.id).find('.itembox').before(
				$('<input id=newurl class=newurl title="新規ブックマークURL" placeholder="新規ブックマークURL">')
				.on({
					// 新規登録
					commit:function(){
						var node = tree.newURL( tree.top(), this.value, this.value.noProto() );
						if( node ){
							// DOM操作(閉パネルポップアップがあるのでDOM要素キャッシュしない)
							$newItem(node).prependTo( $(this.parentNode).find('.itembox') );
							// URLタイトル、favicon取得
							$.get(':analyze?'+this.value.myURLenc(),function(data){
								if( data.title.length ){
									data.title = HTMLdec( data.title );
									if( tree.nodeAttr( node.id, 'title', data.title ) >1 )
										$('#'+node.id).attr('title',data.title).find('span').text(data.title);
								}
								if( data.icon.length )
									if( tree.nodeAttr( node.id, 'icon', data.icon ) >1 )
										$('#'+node.id).find('img').attr('src',data.icon);
							});
							$('#commit').remove();
							this.value = '';
						}
					}
					// Enterで反映
					,keypress:function(ev){
						switch( ev.which || ev.keyCode || ev.charCode ){
						case 13: $(this).trigger('commit'); return false;
						}
					}
				})
				.on('input keyup paste',function(){
					// 文字列がある時だけ登録ボタン生成
					// なぜかsetTimeout()しないと動かない…この時点ではvalueに値が入ってないからかな？
					setTimeout(function(){
						var $newurl = $('#newurl');
						if( $newurl.val().length ){
							if( $newurl.next()[0].id !='commit' )
								$newurl.after(
									$('<div id=commit class=commit tabindex=0>↓↓↓新規登録↓↓↓</div>').on({
										click:function(){ $newurl.trigger('commit'); }
										,keypress:function(ev){
											switch( ev.which || ev.keyCode || ev.charCode ){
											case 13: $newurl.trigger('commit'); return false;
											}
										}
									})
								);
						}
						else $('#commit').remove();
					},10);
				})
			);
			if( postEvent ) postEvent();
			// 測定
			//$debug.text('paneler='+((new Date()).getTime() -start.getTime())+'ms');
		}
	};
}();
// イベント設定
function setEvents(){
	// ブラウザ情報＋インポートイベント
	(function(){
		var browser = { ie:1, chrome:1, firefox:1 };
		$.ajax({
			url		 :':browser.json'
			,success :function(data){ browser = data; }
			,complete:function(){
				if( 'chrome' in browser ){
					// Chromeブックマークインポート
					// サーバから２つのJSONイメージを取得して、結合して独自形式JSONを生成する。
					// GET :chrome.json で、Chromeの Bookmarks を取得(もともとJSON)、
					// GET :chrome.icon.json で Favicons を取得(SQLite3からサーバ側でJSONをつくる)。
					// ※サーバ側で１つに結合しないのは、C言語でJSONを操作したくないから。
					// Bookmarks は、ブックマークのサイトURLを集めたJSONファイル。フォルダ構成を含む。
					//{
					//	version: 1
					//	roots: {
					//		bookmark_bar: {
					//			type: folder
					//			,name: 
					//			,date_added:
					//			,children: [
					//				{ type:folder, name:"", date_added:"", children:[ ... ] }
					//				,{ type:url, name:"", date_added:"", url:url }
					//				,{ type:url, name:"", date_added:"", url:url }
					//			]
					//		}
					//		other: {
					//			type: folder
					//			,name: 
					//			,date_added:
					//			,children: []
					//		}
					//		synced: {
					//			type: folder
					//			,name: 
					//			,date_added:
					//			,children: []
					//		}
					//	}
					//}
					// Favicons は、faviconURLとfavicon画像データを集めたSQLite3データファイル。
					// をれをサーバで { "サイトURL":"faviconURL",... } のJSONに変換する。これは
					// 取得エラーでも動作させる。(自力favicon取得の量が増えて時間がかかる)
					// 独自形式JSONは、BookmarksのJSONにfaviconURLを加えたような感じ(いろいろ違うけど)。
					$('#chromeico').click(function(){
						var bookmarks={};
						var favicons={};
						Confirm({
							msg:'Chromeブックマークデータを取り込みます。#BR#データ量が多いと時間がかります。'
							,ok:function(){
								MsgBox('処理中です...');
								$.ajax({
									url		:':chrome.json'
									,error	:function(xhr){ Alert('データ取得エラー:'+xhr.status+' '+xhr.statusText); }
									,success:function( data ){
										bookmarks = data;
										$.ajax({
											url		 :':chrome.icon.json'
											,success :function(data){ favicons = data; }
											,complete:doImport
										});
									}
								});
							}
						});
						function doImport(){
							var now = (new Date()).getTime();
							// ルートノード
							var root ={
								id			:1
								,nextid		:2
								,dateAdded	:now
								,title		:'root'
								,child		:[]
							};
							// トップノード
							root.child[0] = {
								id			:root.nextid++
								,dateAdded	:now
								,title		:'Chromeブックマーク'
								,child		:[]
							};
							// ごみ箱
							root.child[1] = {
								id			:root.nextid++
								,dateAdded	:now
								,title		:tree.trash().title
								,child		:[]
							};
							// Chromeブックマークのdate_addedをJavaScript.Date.getTime値に変換する。
							// Chromeのdate_addedは、例えば12814387151252000の17桁で、Win32:FILETIME
							// (1601/1/1からの100ナノ秒単位)値に近いもよう。FILETIMEは書式%I64uで出力
							// すると例えば 129917516702250000 の18桁。date_addedはFILETIMEの最後の
							// 1桁を切った(10分の1の)値かな…？そういうことにしておこう。。
							// JavaScriptの(new Date()).getTime()は、1970/1/1からのミリ秒で、例えば
							// 1347278204225 の13桁。ということで、以下サイトを参考に、
							//   [UNIX の time_t を Win32 FILETIME または SYSTEMTIME に変換するには]
							//   http://support.microsoft.com/kb/167296/ja
							// 1. 11644473600000000(たぶん1601-1970のマイクロ秒)を引く。
							// 2. 1000で割る＝マイクロ秒からミリ秒に。
							function jstime( date_added ){
								var t = (parseFloat(date_added||0) -11644473600000000.0) /1000.0;
								return ( t >0 )? parseInt(t) : 0;
							}
							// Chromeノードから自ノード形式変換
							function chrome2node( data ){
								var node = {
									id			:root.nextid++				// 新規ID
									,dateAdded	:jstime( data.date_added )	// 変換
									,title		:data.name					// 移行
								};
								if( data.children ){
									// フォルダ
									node.child = [];
									for( var i=0, n=data.children.length; i<n; i++ ){
										node.child.push( chrome2node( data.children[i] ) );
									}
								}else{
									// ブックマーク
									node.url = data.url;
									node.icon = favicons[data.url] || '';
								}
								return node;
							}
							// トップノードchildに登録('synced'は存在しない場合あり)
							bookmarks = bookmarks.roots;
							if( 'bookmark_bar' in bookmarks )
								root.child[0].child.push( chrome2node(bookmarks.bookmark_bar) );
							if( 'other' in bookmarks )
								root.child[0].child.push( chrome2node(bookmarks.other) );
							if( 'synced' in bookmarks )
								root.child[0].child.push( chrome2node(bookmarks.synced) );
							// 完了
							analyzer( root );
						}
					});
				}
				else $('#chromeico').hide();

				if( 'ie' in browser ){
					// IEお気に入りインポート
					$('#ieico').click(function(){
						Confirm({
							msg:'Internet Explorer お気に入りデータを取り込みます。#BR#データ量が多いと時間がかります。'
							,width:390
							,ok:function(){
								MsgBox('処理中です...');
								$.ajax({
									url		:':favorites.json'
									//url		:':favorites.json?'	// ?をつけるとjsonが改行つき読みやすい
									,error	:function(xhr){ Alert('データ取得エラー:'+xhr.status+' '+xhr.statusText); }
									,success:function(data){ analyzer( data ); }
								});
							}
						});
					});
				}
				else $('#ieico').hide();

				if( 'firefox' in browser ){
					// Firefoxブックマークインポート
					$('#firefoxico').click(function(){
						Confirm({
							msg:'Firefoxブックマークデータを取り込みます。#BR#データ量が多いと時間がかります。'
							,ok:function(){
								MsgBox('処理中です...');
								$.ajax({
									url		:':firefox.json'
									//url		:':firefox.json?'	// ?をつけるとjsonが改行つき読みやすい
									,error	:function(xhr){ Alert('データ取得エラー:'+xhr.status+' '+xhr.statusText); }
									,success:function(data){ analyzer( data ); }
								});
							}
						});
					});
				}
				else $('#firefoxico').hide();
			}
		});
	}());
	// サイドバーにマウスカーソル近づいたらスライド出現させる。
	// #sidebar の width を 34px → 65px に変化させる。index.css とおなじ値を使う必要あり。
	$document.on('mousemove',function(){
		var animate = null;
		return function(ev){
			if( ev.clientX <37 && ev.clientY <300 ){	// サイドバー周辺にある程度近づいた
				if( !animate )
					animate = $sidebar.animate({width:65},'fast');
			}
			else if( animate ){							// サイドバーから離れてるとき隠す
				$sidebar.stop(true).width(34);
				animate = null;
			}
		};
	}())
	// ウォール右クリック新規パネル作成メニュー
	.on('contextmenu','#wall',function(ev){
		var column = null;	// 新規パネルが入るカラム
		var above = null;	// 新規パネルの上のパネル
		var below = null;	// 新規パネルの下のパネル
		$('.column').each(function(){
			if( this.offsetLeft <=ev.pageX && ev.pageX <=this.offsetLeft +this.offsetWidth ){
				var $panels = $(this).children('.panel');
				if( $panels.length ){
					if( ev.pageX < $panels[0].offsetLeft ){
						return false;			// パネル左右余白クリック無視
					}
					if( ev.pageY < $panels[0].offsetTop ){
						below = $panels[0];		// 一番上に新規パネル
						return false;
					}
					var panel = $panels[$panels.length-1];
					if( panel.offsetTop +panel.offsetHeight < ev.pageY ){
						above = panel;			// 一番下に新規パネル
						return false;
					}
					for( var i=$panels.length-1; i>0; i-- ){
						if( ev.pageY < $panels[i].offsetTop &&
							$panels[i-1].offsetTop +$panels[i-1].offsetHeight < ev.pageY ){
							below = $panels[i]; // パネルとパネルの間
							return false;
						}
					}
				}
				else column = this; // 空カラムに新規パネル
				return false;
			}
		});
		if( column || above || below ){
			var $menu = $('#contextmenu');
			var $box = $menu.children('div').empty();
			$box.append($('<a><img src=newfolder.png>ここに新規パネル作成</a>').click(function(){
				$menu.hide();
				// TODO:入力ダイアログは視線移動/マウス移動が多いから使わないUIの方がよいとは思うが
				// パネルの場所をそのままで編集できるUIが必要かな・・それはなかなか難しい。
				InputDialog({
					title:'新規パネル作成'
					,text:'パネル名'
					,ok:function( name ){
						var node = tree.newFolder( name ||'新規パネル' );
						var $p = $newPanel( node );
						if( column ) $(column).append( $p );
						else if( above ) $(above).after( $p );
						else if( below ) $(below).before( $p );
						option.panel.layouted();
					}
				});
			}));
			// メニュー表示
			$menu.css({
				left: (($window.width() -ev.clientX) <$menu.width())? ev.pageX -$menu.width() : ev.pageX
				,top: (($window.height() -ev.clientY) <$menu.height())? ev.pageY -$menu.height() : ev.pageY
			})
			.width(190).show();
			return false;
		}
		return true; // 既定右クリックメニュー
	})
	// パネル右クリックメニュー
	.on('contextmenu','.title',function(ev){
		// ev.targetはクリックした場所にあるDOMエレメント
		var panel = ev.target;
		while( panel.className !='panel' ){
			if( !panel.parentNode ) break;
			panel = panel.parentNode;
		}
		var $menu = $('#contextmenu');
		var $box = $menu.children('div').empty();
		$box.append($('<a><img src=newfolder.png>ここに新規パネル作成</a>').click(function(){
			$menu.hide();
			// TODO:入力ダイアログは視線移動/マウス移動が多いから使わないUIの方がよいとは思うが
			// パネルの場所をそのままで編集できるUIが必要かな・・それはなかなか難しい。
			InputDialog({
				title:'新規パネル作成'
				,text:'パネル名'
				,ok:function( name ){
					var node = tree.newFolder( name ||'新規パネル' );
					var $p = $newPanel( node );
					$(panel).before( $p );
					option.panel.layouted();
				}
			});
		}))
		.append('<hr>')
		.append($('<a><img src=item.png>クリップボードのURLを新規登録</a>').click(function(){
			$menu.hide();
			$.get(':clipboard.txt',function(data){
				var $itembox = $(panel).find('.itembox');
				// 一行一URLとして解析
				var lines = data.split(/[\r\n]+/);
				var index = lines.length -1;
				(function callee(){
					var count = 10;												// 10個ずつ
					while( index >=0 && count>0 ){
						var url = lines[index].replace(/^\s+|\s+$/g,'');		// 前後の空白削除(trim()はIE8ダメ)
						if( /^[A-Za-z]+:\/\/.+$/.test(url) ) itemAdd( url );	// URLなら登録
						index--; count--;
					}
					// 次
					if( index >=0 ) setTimeout(callee,0);
				}());
				function itemAdd( url ){
					// ノード作成
					var node = tree.newURL( tree.node(panel.id), url, url.noProto() );
					if( node ){
						// DOM操作(閉パネルポップアップがあるのでDOM要素キャッシュしない)
						$newItem(node).prependTo( $itembox );
						// タイトル・favicon取得
						$.get(':analyze?'+url.myURLenc(),function(data){
							if( data.title.length ){
								data.title = HTMLdec( data.title );
								if( tree.nodeAttr( node.id, 'title', data.title ) >1 )
									$('#'+node.id).attr('title',data.title).find('span').text(data.title);
							}
							if( data.icon.length )
								if( tree.nodeAttr( node.id, 'icon', data.icon ) >1 )
									$('#'+node.id).find('img').attr('src',data.icon);
						});
					}
				}
			});
		}))
		.append($('<a><img src=pen.png>パネル編集（パネル名・アイテム編集）</a>').click(function(){
			$menu.hide();
			panelEdit( panel.id );
		}))
		.append($('<a><img>アイテムをテキストで取得</a>').click(function(){
			$menu.hide();
			var text='';
			var child = tree.node( panel.id ).child;
			for( var i=0, n=child.length; i<n; i++ ){
				if( !child[i].child ){
					text += child[i].title + '\r' + child[i].url + '\r';
				}
			}
			$('#editbox').empty().append($('<textarea></textarea>').text(text)).dialog({
				title	:'アイテムをテキストで取得'
				,modal	:true
				,width	:480
				,height	:360
				,close	:function(){ $(this).dialog('destroy'); }
				,resize	:function(){
					// CSSのheight:100%;でダイアログリサイズするとタイトルバーが２行になった時に
					// 表示が崩れてしまい回避策がわからないので、ここでリサイズイベント処理する。
					// マウスを速く動かすと、このresizeイベントはきっちり発火されるのにダイアログ
					// の大きさは途中までしか追従しないという、なんだか矛盾した挙動になるため、
					// setTimeoutで適当に溜めて処理する。マウスが止まってから少し遅れて高さ方向が
					// 調節される感じで表示の追従性が悪いのが難点。CSSのwidth:100%;は表示崩れも
					// なく追従性もよいので、できればCSSでやりたいのだが…。
					// TODO:メイリオだとよいがMSPゴシックで高さがイマイチ
					var timer = null;
					var $box = $('#editbox');
					var $area = $box.find('textarea');
					return function(){
						clearTimeout(timer);
						timer = setTimeout(function(){
							// $box.prev()はダイアログタイトルバー(<div class="ui-dialog-titlebar">)
							$area.height( $box.height() -$box.prev().height() +15 );
						},20);
					};
				}()
			});
		}));
		// TODO:開く/閉じる、全パネルを閉じる、全パネルを開く
		if( tree.movable( panel.id ) ){
			$box.append('<hr>')
			.append($('<a><img src=delete.png>このパネルを削除</a>').click(function(){
				$menu.hide();
				tree.moveChild( [panel.id], tree.trash() );
				$(panel).remove();
				option.panel.layouted();
			}));
		}
		// メニュー表示
		$menu.css({
			left: (($window.width() -ev.clientX) <$menu.width())? ev.pageX -$menu.width() : ev.pageX
			,top: (($window.height() -ev.clientY) <$menu.height())? ev.pageY -$menu.height() : ev.pageY
		})
		.width(280).show();
		return false;	// 既定右クリックメニュー出さない
	})
	.on('mousedown',function(ev){
		// 右クリックメニュー隠す
		for( var e=ev.target; e; e=e.parentNode ) if( e.id=='contextmenu' ) return;
		$('#contextmenu').hide();
	})
	// ＋－ボタンクリックでパネル開閉
	.on('click','.plusminus',function( ev, pageX, pageY ){
		pageX = pageX || ev.pageX;
		pageY = pageY || ev.pageY;
		// パネルID＝親(.title)の親(.panel)のID
		panelOpenClose( this.parentNode.parentNode.id, true, pageX, pageY );
		// 開閉状態保存: キーがボタンID、値が 0(開) または 1(閉)
		// 例) { btn1:1, btn9:0, btn45:0, ... }
		var status = {};
		$('.plusminus').each(function(){
			//srcはURL('http://localhost:XXX/plus.png'など)文字列
			status[this.id] = /\/plus.png$/.test(this.src)? 1 : 0;
		});
		option.panel.status( status );
	})
	// パネルタイトルダブルクリックで開閉
	.on('dblclick','.title',function(ev){
		// ＋－ボタン上の場合は何もしない
		if( $(ev.target).hasClass('plusminus') ) return;
		$(this).find('.plusminus').trigger('click',[ ev.pageX, ev.pageY ]);
	})
	// 編集アイコンクリックでパネル編集
	.on('click','.pen',function(){
		// パネルID＝親(.title)の親(.panel)のID
		panelEdit( this.parentNode.parentNode.id );
	});
	// 変更保存リンク
	$('#modified').click(function(ev){
		if( ev.target.id=='modified' ) modifySave();
	});
	$('#modified label,#autoshot').click(function(){
		option.autoshot( $('#autoshot').attr('checked')? true:false );
	});
	// パネル設定ダイアログ
	$('#optionico').click(function(){
		// ページタイトル
		$('#page_title').val( option.page.title() )
		.off().on('input keyup paste',function(){
			if( this.value != option.page.title() ){
				option.page.title( this.value );
				document.title = option.page.title();
			}
		});
		// 色テーマ
		$('input[name=colorcss]').each(function(){
			if( this.value==option.color.css() )
				$(this).attr('checked','checked');
		})
		.off().change(function(){
			option.color.css( this.value );
			$('#colorcss').attr('href',option.color.css());
		});
		// 全体
		$('input[name=wall_margin]').each(function(){
			if( this.value==option.wall.margin() )
				$(this).attr('checked','checked');
		})
		.off().change(function(){
			option.wall.margin( this.value );
			$wall.css('margin',option.wall.margin());
		});
		// パネル幅
		$('#panel_width').val( option.panel.width() )
		.off().on('input keyup paste',function(){
			if( !/^\d{3,4}$/.test(this.value) || this.value <100 || this.value >1000 ) return;
			if( this.value !=option.panel.width() ){
				option.panel.width( this.value );
				optionApply();
			}
		})
		.next().off().click(function(){
			var val = option.panel.width();
			if( val <1000 ){
				option.panel.width( ++val );
				optionApply();
				$('#panel_width').val( val );
			}
		})
		.next().off().click(function(){
			var val = option.panel.width();
			if( val >100 ){
				option.panel.width( --val );
				optionApply();
				$('#panel_width').val( val );
			}
		});
		// パネル余白
		$('#panel_marginV').val( option.panel.margin.top() )
		.off().on('input keyup paste',function(){
			if( !/^\d{1,3}$/.test(this.value) || this.value <0 || this.value >50 ) return;
			if( this.value !=option.panel.margin.top() ){
				option.panel.margin.top( this.value );
				optionApply();
			}
		})
		.next().off().click(function(){
			var val = option.panel.margin.top();
			if( val <50 ){
				option.panel.margin.top( ++val );
				optionApply();
				$('#panel_marginV').val( val );
			}
		})
		.next().off().click(function(){
			var val = option.panel.margin.top();
			if( val >0 ){
				option.panel.margin.top( --val );
				optionApply();
				$('#panel_marginV').val( val );
			}
		});
		$('#panel_marginH').val( option.panel.margin.left() )
		.off().on('input keyup paste',function(){
			if( !/^\d{1,3}$/.test(this.value) || this.value <0 || this.value >50 ) return;
			if( this.value !=option.panel.margin.left() ){
				option.panel.margin.left( this.value );
				optionApply();
			}
		})
		.next().off().click(function(){
			var val = option.panel.margin.left();
			if( val <50 ){
				option.panel.margin.left( ++val );
				optionApply();
				$('#panel_marginH').val( val );
			}
		})
		.next().off().click(function(){
			var val = option.panel.margin.left();
			if( val >0 ){
				option.panel.margin.left( --val );
				optionApply();
				$('#panel_marginH').val( val );
			}
		});
		// 列数
		$('#column_count').val( option.column.count() )
		.off().on('input keyup paste',function(){
			if( !/^\d{1,2}$/.test(this.value) || this.value < 1 || this.value > 30 ) return;
			if( this.value !=option.column.count() ){
				columnCountChange( { prev:option.column.count(), next:this.value } );
				option.column.count( this.value );
				optionApply();
			}
		})
		.next().off().click(function(){
			var val = option.column.count();
			if( val <30 ){
				columnCountChange( { prev:val, next:val+1 } );
				option.column.count( ++val );
				optionApply();
				$('#column_count').val( val );
			}
		})
		.next().off().click(function(){
			var val = option.column.count();
			if( val >1 ){
				columnCountChange( { prev:val, next:val-1 } );
				option.column.count( --val );
				optionApply();
				$('#column_count').val( val );
			}
		});
		// アイコン拡大
		$('#icon_size').val( option.icon.size() )
		.next().off().click(function(){
			var val = option.icon.size();
			if( val <24 ){
				option.icon.size( ++val );
				optionApply();
				$('#icon_size').val( val );
			}
		})
		.next().off().click(function(){
			var val = option.icon.size();
			if( val >0 ){
				option.icon.size( --val );
				optionApply();
				$('#icon_size').val( val );
			}
		});
		// フォントサイズ
		$('#font_size').val( option.font.size() )
		.next().off().click(function(){
			var val = option.font.size();
			if( val <24 ){
				option.font.size( ++val );
				optionApply();
				$('#font_size').val( val );
			}
		})
		.next().off().click(function(){
			var val = option.font.size();
			if( val >9 ){
				option.font.size( --val );
				optionApply();
				$('#font_size').val( val );
			}
		});
		// フォント - フォント種類ぶんのCSSファイルを切り替える方式。
		// CSSルール書き換えはブラウザ互換が心配＋面倒な感じするので却下。
		// http://pointofviewpoint.air-nifty.com/blog/2012/11/jquerycss-7530.html
		// http://d.hatena.ne.jp/ofk/20090716/1247719727
		$('input[name=fontcss]').each(function(){
			if( this.value==option.font.css() )
				$(this).attr('checked','checked');
		})
		.off().change(function(){
			option.font.css( this.value );
			$('#fontcss').attr('href',option.font.css());
		});
		// ダイアログ表示
		$('#option').dialog({
			title	:'パネル設定'
			,modal	:true
			,width	:420
			,height	:410
			,close	:function(){ $(this).dialog('destroy'); }
			,buttons:{
				'パネル設定クリア':function(){
					option.font.size(-1).column.count(-1).panel.margin.top(-1).panel.margin.left(-1).panel.width(-1);
					$('#panel_width').val( option.panel.width() );
					$('#panel_marginV').val( option.panel.margin.top() );
					$('#panel_marginH').val( option.panel.margin.left() );
					$('#column_count').val( option.column.count() );
					$('#font_size').val( option.font.size() );
					optionApply();
				}
				,'パネル配置クリア':function(){
					option.panel.layout({});
					paneler( tree.top() );
				}
			}
		});
	});
	// ブックマークの整理
	$('#filerico').click(function(){
		if( !tree.modified() && !option.modified() ){
			gotoFiler();
		}
		else Confirm({
			msg	:'変更が保存されていません。いま保存して次に進みますか？　「いいえ」で変更を破棄して次に進みます。'
			,width:380
			,no	:function(){ gotoFiler(); }
			,yes:function(){ modifySave({ success:gotoFiler }); }
		});
		function gotoFiler(){ location.href = 'filer.html'; }
	});
	// * HTMLエクスポート
	//   クライアント側でHTML生成するか、サーバ側でHTML生成するか悩む。
	//   クライアント側で生成する場合、それを単純にダウンロードできればよいが、
	//   HTML5のFileAPIを使う必要がありそう。こんな↓トリッキーな方法もあるようだが、
	//     [JavaScriptでテキストファイルを生成してダウンロードさせる]
	//     http://piro.sakura.ne.jp/latest/blosxom.cgi/webtech/javascript/2005-10-05_download.htm
	//   トリッキーなだけに動いたり動かなかったりといった懸念がある。
	//     http://productforums.google.com/forum/#!topic/chrome-ja/q5QdYQVZctM
	//   そうするとやはり一旦サーバ側にアップロードして、それをダウンロードするのが適切？
	//   サーバ側ではファイル保存ではなくメモリ保持もありうるが…、実装が面倒くさいのでファイル保存。
	//   エクスポートボタン押下でサーバに PUT bookmarks.html 後、GET bookmarks.html に移動する。
	//   この場合、クライアント側で保持しているノードツリーがHTML化される。つまりまだ保存していない
	//   データならそれがHTML化される。
	//   サーバ側でHTML生成する場合は、ブラウザが持ってる未保存データは無視して保存済みtree.json
	//   をHTML化することになる。CでJSONパースコードを書くか、適当なライブラリを導入してパースする。
	//   これは単にサーバ側で /bookmarks.html のリクエストに対応してリアルタイムにJSON→HTML変換して
	//   応答を返せばいいので、サーバ側で無駄にファイル作ることもない。その方が単純かなぁ？
	//   どっちでもいい気がするが、とりあえず実装が楽な方、クライアント側でのHTML生成にしてみよう。
	// * HTMLインポート
	//   NETSCAPE-Bookmark-file-1をパースしてJSONに変換する処理を、JavaScriptで書くかCで書くか。
	//   JavaScriptのが楽かな。…と思ったら、<input type=file>のファイルデータをJavaScriptで取得
	//   できないのか。HTML5のFileAPIでできるようになったと…。なんだじゃあサーバに一旦アップする
	//   しかないか。そしてサーバ側でJSONに変換するか、無加工で取得してクライアント側で変換するか？
	//   HTMLのパースをCで書くかJavaScriptで書くか…。どっちも手間そうだから動作軽そうなCにしよう。
	//   画面遷移せずにアップロードできるというトリッキーな方法。
	//   [Ajax的に画像などのファイルをアップロードする方法]
	//   http://havelog.ayumusato.com/develop/javascript/e171-ajax-file-upload.html
	//   [画面遷移なしでファイルアップロードする方法 と Safariの注意点]
	//   http://groundwalker.com/blog/2007/02/file_uploader_and_safari.html
	//   TODO:Firefoxはインポートしたブックマークタイトルで&#39;がそのまま表示されてしまう…
	//   TODO:FirefoxダイレクトインポートとHTML経由インポートとでツリー構造が異なる。
	//   独自ダイレクトインポートのJSONを、Firefoxが生成するHTMLにあわせればよいのだが…。
	//
	$('#impexpico').click(function(){
		// なぜかbutton()だけだとhover動作が起きないので自力hover()。
		// dialog()で作ったボタンはhoverするから同じにしてくれればいいのに…。
		$('#import,#export').off().button().hover(
			function(){ $(this).addClass('ui-state-hover'); },
			function(){ $(this).removeClass('ui-state-hover'); }
		);
		$('#import').click(function(){
			var $impexp = $('#impexp');
			if( $impexp.find('input').val().length ){
				$impexp.find('form').off().submit(function(){
					$impexp.find('iframe').off().one('load',function(){
						var jsonText = $(this).contents().text();
						if( jsonText.length ){
							try{ analyzer( $.parseJSON(jsonText) ); }
							catch( e ){ Alert(e); }
						}
						$(this).empty();
						$impexp.dialog('destroy');
					});
					MsgBox('処理中です...');
				}).submit();
			}
		});
		$('#export').click(function(){
			// ブックマーク形式HTML(NETSCAPE-Bookmark-file-1)フォーマット
			// [Netscape Bookmark File Format]
			// http://msdn.microsoft.com/en-us/library/aa753582%28v=vs.85%29.aspx
			// [Netscape 4/6のブックマークファイルの形式]
			// http://homepage3.nifty.com/Tatsu_syo/Devroom/NS_BM.txt
			var html ='<!DOCTYPE NETSCAPE-Bookmark-file-1>\n'
					+'<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n'
					+'<TITLE>Bookmarks</TITLE>\n'
					+'<H1>'+tree.top().title+'</H1>\n'
					+'<DL><p>\n';
			(function callee( child, depth ){
				var indent='';
				for(var i=0,n=depth*4; i<n; i++ ) indent +=' ';
				for(var i=0,n=child.length; i<n; i++ ){
					var node = child[i];
					// 日付時刻情報は、ADD_DATE=,LAST_MODIFIED=,LAST_VISIT=があるようだが、
					// ADD_DATE=しか持ってないからそれだけでいいかな…。10桁なので1970/1/1
					// からの秒数(UnixTime)かな？そういうことにしておこう。。
					var add_date = ' ADD_DATE="' +parseInt( (node.dateAdded||0) /1000 ) +'"';
					if( node.child ){
						// フォルダ
						html += indent +'<DT><H3' +add_date +'>' +node.title +'</H3>\n';
						html += indent +'<DL><p>\n';
						callee( node.child, depth+1 );
						html += indent +'</DL><p>\n';
					}
					else{
						// ブックマーク
						// faviconの情報が、Chromeが生成したものはICON=に画像のPNG形式+Base64データ。
						//   <DT><A HREF="xxx" ICON="data:image/png;base64,iVBOR...">タイトル</A>
						// IEが生成したものはICON_URI=にfaviconアドレス。
						//   <DT><A HREF="xxx" ICON_URI="http://xxx.ico" >タイトル</A>
						// Firefoxが生成したものはICON=とICON_URI=と両方入ってるもよう。
						// faviconの生データは保持してないから、IE方式でいくかな…。
						// TODO:エクスポートしたHTMLをChrome,Firefoxにインポートすると、やはり
						// favicon情報が欠落したような状態。ICON=を記述しないとダメなのか…。
						// 画像データを独自保持したり、時間かかるけどエクスポート時に取得してもよいが、
						// Chromeにあわせるなら画像形式をPNGに変換しないといけないので手間がかかる…。
						// おそらくICO形式だとサイズが無駄にデカいのでPNGにしてるのかな。JavaScriptで
						// PNG変換とか無理ゲーなのでサーバ側でやるにしても、画像形式変換ライブラリを
						// 使わないと…GDI+でいけるのかな？でもたいへん面倒なのでやめる。
						var href = ' HREF="' +encodeURI(node.url||'') +'"';
						var icon_uri = ' ICON_URI="' +encodeURI(node.icon||'') +'"';
						html += indent +'<DT><A' +href +add_date +icon_uri +'>' +node.title +'</A>\n';
					}
				}
			}( tree.top().child, 1 ));
			html += '</DL><p>\n';
			// アップロード＆ダウンロード
			$.ajax({
				type	:'put'
				,url	:'export.html'
				,data	:html
				,error	:function(xhr){ Alert('データ保存できません:'+xhr.status+' '+xhr.statusText); }
				,success:function(){ location.href = 'export.html'; }
			});
		});
		// ダイアログ表示
		$('#impexp').dialog({
			title	:'HTMLインポート・エクスポート'
			,modal	:true
			,width	:460
			,height	:330
			,close	:function(){ $(this).dialog('destroy'); }
		});
	});
	// スナップショット
	$('#snapico').click(function(){
		// なぜかbutton()だけだとhover動作が起きないので自力hover()。
		// dialog()で作ったボタンはhoverするから同じにしてくれればいいのに…。
		$('#shot a,#shotview,#shotdel').off().button().hover(
			function(){ $(this).addClass('ui-state-hover'); },
			function(){ $(this).removeClass('ui-state-hover'); }
		);
		// 一覧取得表示
		var $shots = $('#shots').text('...取得中...');
		$.ajax({
			url		:':shotlist'
			,error	:function(xhr){ $shots.empty(); Alert('作成済みスナップショット一覧を取得できません:'+xhr.status+' '+xhr.statusText); }
			,success:function(data){ shotlist( data ); }
		});
		// 作成ボタン
		$('#shot a').click(function(){
			var $btn = $(this).hide();	// ボタン隠して
			$btn.next().show();			// 処理中画像(wait.gif)表示
			// メモを編集した状態からいきなり作成ボタンを押すと、inputのblurイベント(メモ保存ajax)
			// とこのクリックイベントのajaxが同時発生する。ブラウザではblurの方が先のようだが、
			// サーバ側で逆転する場合があるのか、メモ保存前にsnapshotが実行されてしまい、メモが
			// まだない状態の一覧が表示されて、メモが消えたような感じになる。再表示すればメモは
			// 保存されているが、問題だ。どうしよう…setTimeoutでいいかな？サーバ側での実行順序
			// を保証できるわけではないが、とりあえず…。
			setTimeout(function(){
				$.ajax({
					url		:':snapshot'
					,error	:function(xhr){
						Alert('作成できません:'+xhr.status+' '+xhr.statusText);
						$btn.next().hide();
						$btn.show();
					}
					,success:function(data){
						shotlist( data );
						$btn.next().hide();
						$btn.show();
					}
				});
			},100);
		});
		// 復元
		$('#shotview').click(function(){
			var $btn = $(this);
			var item = null;
			$shots.find('div').each(function(){
				if( $(this).hasClass('select') ){ item=this; return false; }
			});
			if( item ){
				if( !tree.modified() && !option.modified() ){
					shotView();
				}
				else Confirm({
					msg	:'変更が保存されていません。いま保存して次に進みますか？　「いいえ」で変更を破棄して次に進みます。'
					,width:380
					,no	:function(){ shotView(); }
					// TODO:"はい"で保存してからshotViewが実行されるまでのわずかな間、復元ボタンが
					// wait.gifにならずダイアログも閉じているのでまたクリックできてしまう。
					,yes:function(){ modifySave({ success:shotView }); }
				});
			}
			function shotView(){
				$btn.hide().next().show();	// ボタン隠して処理中画像(wait.gif)表示
				$.ajax({
					url		:':shotget?'+item.id
					,error	:function(xhr){
						Alert('データ取得できません:'+xhr.status+' '+xhr.statusText);
						$btn.next().hide();
						$btn.show();
					}
					,success:function(data){
						if( 'index.json' in data ) option.merge( data['index.json'] );
						else option.clear();
						paneler( tree.replace(data['tree.json']).top() );
						$btn.next().hide();
						$btn.show();
					}
				});
			}
		});
		// 消去
		// TODO:削除後に次エントリか前エントリを選択状態にする
		$('#shotdel').click(function(){
			var $btn = $(this);
			var item = null;
			$shots.find('div').each(function(){
				if( $(this).hasClass('select') ){ item=this; return false; }
			});
			if( item ){
				Confirm({
					msg:$(item).find('.date').text()+'　のスナップショットを#BR#ディスクから完全に消去します。'
					,ok:function(){
						$btn.hide().next().show();	// ボタン隠して処理中画像(wait.gif)表示
						$.ajax({
							url		:':shotdel?'+item.id
							,error	:function(xhr){
								Alert('消去できません:'+xhr.status+' '+xhr.statusText);
								$btn.next().hide();
								$btn.show();
							}
							,success:function(data){
								// 削除できなくてもサーバからエラー応答は返らず一覧が返却されるので
								// 成功しても毎回一覧を更新することで削除できなかったことを判断
								shotlist( data );
								$btn.next().hide();
								$btn.show();
							}
						});
					}
				});
			}
		});
		// ダイアログ表示
		$('#snap').dialog({
			title	:'スナップショット'
			,modal	:true
			,width	:540
			,height	:420
			,close	:function(){
				// メモを保存
				$shots.find('div').each(function(){
					if( $(this).hasClass('select') ){
						$(this).find('.memo').blur();
						return false;
					}
				});
				$(this).dialog('destroy');
			}
		});
		// スナップショット一覧(再)表示
		// パネル生成と同様$.clone()で高速化できるけど…そんな遅くないしまあいいか…
		function shotlist( list ){
			$shots.empty();
			var date = new Date();
			var nowTime = (new Date()).getTime();
			for( var i=0, n=list.length; i<n; i++ ){
				date.setTime( list[i].date||0 );
				var $item = $('<div id="' + list[i].id + '"></div>');
				var $date = $('<span class=date>' + myFmt(date,nowTime) + '</span>');
				var $memo = $('<input class=memo value="' + (list[i].memo||'') + '">');
				// アイテムクリック選択
				$item.click(function(ev){
					$shots.find('div').removeClass('select');
					$(this).addClass('select');
				});
				// メモ欄イベント
				$memo.on({
					// フォーカス失う時、変更があればサーバに保存
					// TODO:.cabファイルはサーバ側で管理しておりブラウザはファイルパスを認識しなくてもよいが
					// メモファイルはブラウザがサーバ側のパス(snapフォルダ内とか)を意識してPUTしているので、
					// ちょっと仕様が汚い。でもサーバ側のPOST実装対応が面倒でPUTのが楽だったので…(；´Д｀)
					blur:function(){
						var id = this.parentNode.id;
						var text = this.value;
						var item = null;
						for( var i=0, n=list.length; i<n; i++ ){
							if( list[i].id==id && list[i].memo!=text ){
								// 変更あり
								item = list[i];
								break;
							}
						}
						if( item ){
							var opt = {
								type	:text.length? 'put' : 'del'
								,url	:'snap/'+id.replace(/cab$/,'txt')
								,error	:function(xhr){ Alert('メモを保存できません:'+xhr.status+' '+xhr.statusText); }
								,success:function(){ item.memo=text; widthAdjust(); }
							};
							if( text.length ) opt.data = text;
							$.ajax(opt);
						}
					}
					// メモ欄Enterで次アイテム選択
					,keypress:function(ev){
						switch( ev.which || ev.keyCode || ev.charCode ){
						case 13:
							$(this.parentNode).next().click().find('.memo').focus();
							return false;
						}
					}
					// メモ欄↑↓キーでアイテム選択移動
					,keydown:function(ev){
						switch( ev.which || ev.keyCode || ev.charCode ){
						case 38: // ↑
							$(this.parentNode).prev().click().find('.memo').focus();
							return false;
						case 40: // ↓
							$(this.parentNode).next().click().find('.memo').focus();
							return false;
						}
					}
				});
				// 新しいアイテムほど上に。新しいとはタイムスタンプ比較ではなく
				// 単に配列の後の方が新しい(サーバからそう返却されるはず…)。
				$shots.prepend( $item.append($date).append($memo) );
			}
			widthAdjust();

			// 一欄の横幅を計算してセットする。<span>を使って文字列描画幅を算出。
			// http://qiita.com/items/1b3802db80eadf864633
			function widthAdjust(){
				// メモ欄の文字列横幅最大を算出
				var maxWidth = 0;
				var $span = $('<span></span>').css({
						position		:'absolute'
						,visibility		:'hidden'
						,'white-space'	:'nowrap'
						,'font-weight'	:'bold'
					}).appendTo(document.body);
				for( var i=list.length-1; i>=0; i-- ){
					if( list[i].memo && list[i].memo.length>0 ){
						var width = $span.text(list[i].memo).width();
						if( width > maxWidth ) maxWidth = width;
					}
				}
				$span.remove();
				// 横幅小さすぎ修正
				var dateWidth = $shots.find('.memo').position().left;
				var minWidth = $('#shotbox').width() - dateWidth -17;	// -17pxスクロールバー
				if( minWidth > maxWidth ) maxWidth = minWidth;
				// メモ欄INPUTを最大幅にセット
				$shots.find('.memo').width( maxWidth -5 );	// なぜかはみ出るので適当調節
				// 全体幅セット
				maxWidth += dateWidth;
				$('#shothead').width( maxWidth );
				$shots.find('div').width( maxWidth );
			}
		}
	});
	// 検索
	// TODO:単なるダイアログボックスじゃないもっといいUIはないか
	// 上下左右のいずれか選択できるposition:fixな領域にしたい。
	// あと検索結果のURLアイテムはドラッグ＆ドロップでパネルに。
	// 検索結果のフォルダ(パネル)は動かせなくてもいいかな。
	// jQuery UI Tabs
	$('#findtab').tabs({
		select:function( ev, ui ){
			if( /#keyword$/.test(ui.tab.href) ){
				// キーワードのテキストボックスにフォーカス移動
				setTimeout(function(){ $('#keyword').find('input').focus(); },0);
			}
		}
	})
	.find('button').button().end()
	.find('.progress').progressbar();
	// キーワードテキストボックスEnterで検索開始
	$('#keyword').find('input').keypress(function(ev){
		switch( ev.which || ev.keyCode || ev.charCode ){
		case 13: $('#keyword').find('.start').click(); return false;
		}
	});
	$('#findico').click(function(){
		$('#find').dialog({
			title	:'ブックマーク検索'
			,width	:560
			,height	:380
			,close	:function(){ $(this).dialog('destroy'); }
		});
		$('#keyword').find('input').focus();
		// パネル(フォルダ)配列生成・URL総数カウント
		// パネル1,334+URL13,803でIE8でも15ms程度で完了するけっこう速い
		var panels = [];	// パネルノード配列
		var urlTotal = 0;	// URL数
		function callee( node ){
			panels.push( node );
			urlTotal += node.child.length;
			for( var i=0, n=node.child.length; i<n; i++ ){
				if( node.child[i].child ){
					callee( node.child[i] );
					urlTotal--;
				}
			}
		}
		callee( tree.top() );
		callee( tree.trash() );
		// キーワード検索
		$('#keyword').find('.start').off().click(function(){
			var $my = $('#keyword');
			// 検索ワード
			var words = $my.find('input').val().split(/[ 　]+/); // 空白文字で分割
			for( var i=words.length-1; i>=0; i-- ){
				if( words[i].length<=0 ) words.splice(i,1);
			}
			if( words.length<=0 ) return;
			// 検索中表示・準備
			var $wait = $('<img src=wait.gif>').appendTo( $my.find('.found').empty() );
			var $pgbar = $my.find('.progress').progressbar('value',0);
			var $url = $('<a target="_blank"><img class=icon><span></span></a>');
			var $pnl = $('<div><img src=folder.png class=icon><span></span></div>');
			var timer = null;
			$my.find('.stop').off().click(function(){
				// キャンセル
				clearTimeout( timer );
				$(this).hide();
				$pgbar.progressbar('value',0);
				$wait.remove();
				$url.remove();
				$pnl.remove();
			}).show();
			// 検索実行
			var nodeTotal = urlTotal + panels.length;
			var index = 0;
			var total = 0;
			(function callee(){
				function found( text ){
					// AND検索
					// TODO:OR検索、数字/カタカナの全角半角の区別、大小文字区別
					// http://logicalerror.seesaa.net/article/275434211.html
					// http://distraid.co.jp/demo/js_codeconv.html
					text.replace(/[！-～]/g, function(s){
						return String.fromCharCode(s.charCodeAt(0)-0xFEE0);
					});
					for( var i=words.length-1; i>=0; i-- ){
						if( text.indexOf(words[i])<0 ) return false;
					}
					return true;
				}
				var limit = total +21; // 20ノード以上ずつ
				while( index < panels.length && total<limit ){
					// パネル名
					if( found( panels[index].title ) ){
						$wait.before(
							$pnl.clone()
								.find('span').text(panels[index].title).end()
						);
					}
					total++;
					// ブックマークタイトルとURL
					var child = panels[index].child;
					for( var i=0, n=child.length; i<n; i++ ){
						if( child[i].child ) continue;
						if( found( child[i].title ) || found( child[i].url ) ){
							$wait.before(
								$url.clone()
									.attr('href',child[i].url)
									.find('img').attr('src',child[i].icon).end()
									.find('span').text(child[i].title).end()
							);
						}
						total++;
					}
					index++;
				}
				// 進捗バー
				$pgbar.progressbar('value',total*100/nodeTotal);
				// 次
				if( index < panels.length ) timer = setTimeout(callee,0);
				else $my.find('.stop').click();
			}());
		});
		// リンク切れ調査
		$('#deadlink').find('.start').off().click(function(){
			var $my = $('#deadlink');
		});
	});
	// パネル並べ替え
	Sortable({
		itemClass:'panel'
		,boxClass:'column'
		,distance:30
		,start:function( item ){ // 並べ替えドラッグ開始
			// item==パネル要素
			var $panel = $(item);
			// 閉パネルポップアップ停止(しないとおかしな場所にポップアップして幽霊のようになる)
			if( $panel.find('.plusminus').attr('src')=='plus.png' ){
				$panel.off().find('.itembox').hide();
			}
			// カーソルと共に移動するjQuery要素を返却
			return $panel.css({ position:'absolute', opacity:0.4 });
		}
		,place:function( item ){ // ドロップ場所作成
			// item==パネル要素
			var $panel = $(item);
			// ドロップ場所を示すjQueryオブジェクトを返却
			return $('<div></div>')
					.addClass('paneldrop')
					.css('marginLeft',$panel.css('marginLeft'))
					.css('marginTop',$panel.css('marginTop'))
					.height( option.font.size() +option.icon.size() +5 );
		}
		,onDrag:function( ev, $panel, $place ){ // ドラッグ中
			if( ev.target.id=='wall' ){
				$('.column').each(function(){
					if( this.offsetLeft <=ev.pageX && ev.pageX <=this.offsetLeft +this.offsetWidth ){
						$(this).append( $place );
						return false;
					}
				});
			}
		}
		,stop:function( $panel, $place ){ // 並べ替え終了
			// $panel==start()戻り値、$place==place()戻り値
			if( $place.parent().hasClass('column') ) $place.after( $panel );
			$place.remove();
			$panel.css({ position:'', opacity:1 });
			// 閉パネルポップアップ再開
			if( $panel.find('.plusminus').attr('src')=='plus.png' ){
				$panel.find('.plusminus').attr({ src:'minus.png', title:'閉じる' });
				panelOpenClose( $panel[0].id );
			}
			option.panel.layouted();
		}
	});
	// パネルアイテム並べ替え
	// TODO:閉パネルアイテムをドラッグして外に出て（ポップアップ消えて）、また戻る（ポップアップする）と
	// ドラッグアイテムの半透明化が解除されている。ポップアップ処理の方でアイテムがドラッグ中かどうか判別
	// しないとダメかな・・面倒くさそう・・。
	(function(){
		var node = null;
		Sortable({
			itemClass:'item'
			,boxClass:'itembox'
			,distance:20
			,start:function( item ){ // 並べ替えドラッグ開始
				// item==アイテム要素は閉パネルポップアップで削除される事があるので、
				// 要素の元ノード情報を保持して、
				node = tree.node( item.id );
				if( node ){
					var $item = $(item);
					// 元の要素は半透明にして、
					$item.css('opacity',0.4);
					// カーソルと共に移動する要素は新規作成して返却
					return $('<div class=panel></div>')
							.css({
								position: 'absolute'
								,'font-size': option.font.size() +'px'
							})
							.width( $item.width() )
							.append( $('<a class=item></a>').append( $item.children().clone() ) )
							.appendTo( document.body );
				}
			}
			,place:function( item ){ // ドロップ場所作成
				// item==アイテム要素
				return $('<div></div>').addClass('itemdrop');
			}
			,stop:function( $item, $place ){ // 並べ替え終了
				// $item==start()戻り値、$place==place()戻り値
				if( node ){
					if( $place.parent().hasClass('itembox') ){
						var $prev = $place.prev();
						var $next = $place.next();
						if( $prev.hasClass('item') ){
							if( $next.hasClass('item') ){
								if( $prev[0].id !=node.id && $next[0].id !=node.id ){
									tree.moveSibling( [node.id], $next[0].id );
								}
							}
							else if( $prev[0].id !=node.id ){ // 末尾
								tree.moveSibling( [node.id], $prev[0].id, true );
							}
						}
						else if( $next.hasClass('item') ){
							if( $next[0].id !=node.id ){ // 先頭
								tree.moveSibling( [node.id], $next[0].id );
							}
						}
						else{ // 空パネル
							tree.moveChild( [node.id], $place.parent().parent()[0].id );
						}
						$('#'+node.id).remove();
						$place.after( $newItem(node) );
					}
					node = null;
				}
				$item.remove();
				$place.remove();
			}
		});
	}());
	// サイドバーボタンキー入力
	$('.barico').on({
		keypress:function(ev){
			switch( ev.which || ev.keyCode || ev.charCode ){
			case 13: $(this).click(); return false;
			}
		}
		// ボタンにフォーカス来たらサイドバーを出したい。CSSに書いておきたいけど、
		// 子要素(ボタン)がフォーカスした時(:focus)に親要素(サイドバー)のスタイル変更って
		// どうやって書くの？書けない？しょうがないのでJSで…このピクセル値とindex.cssの
		// #sidebarは同期必要。
		,focus:function(){ $sidebar.width(65); }
		,blur:function(){ $sidebar.width(34); }
	});
	// IE8テキスト選択キャンセル
	if( IE && IE<9 ) $document.on('selectstart',function(ev){
		switch( ev.target.tagName ){
		case 'INPUT': case 'TEXTAREA': return true;
		}
		return false;
	});
}
// 独自フォーマット時刻文字列
function myFmt( date, nowTime ){
	// 0=1970/1/1は空
	var diff = date.getTime();
	if( diff <1 ) return '';
	// 年月日 時分
	var Y = date.getFullYear();
	var M = date.getMonth() +1;
	var D = date.getDate();
	var h = date.getHours();
	var m = date.getMinutes();
	var date = M+'/'+D;
	var time = h+':'+m;
	// 現在時刻との差分
	diff = ((nowTime - diff) /1000)|0;
	if( diff <=10 ) return 'いまさっき <small>(' +time +')</small>';
	if( diff <=60 ) return '1分以内 <small>(' +time +')</small>';
	if( diff <=3600 ) return ((diff /60)|0) +'分前 <small>(' +time +')</small>';
	if( diff <=3600*1.5 ) return '1時間前 <small>(' +time +')</small>';
	if( diff <=3600*24 ) return Math.round(diff /3600) +'時間前 <small>(' +date +' ' +time +')</small>';
	if( diff <=3600*24*30 ) return Math.round(diff /3600 /24) +'日前 <small>(' +date +' ' +time +')</small>';
	return Y+'年'+M+'月'+D+'日　'+h+'時'+m+'分';
}
// 要素の内側に座標XYがある
function elementHasXY( e, x, y ){
	return ( x >= e.offsetLeft && y >= e.offsetTop && x <= e.offsetLeft + e.offsetWidth && y <= e.offsetTop + e.offsetHeight );
}
// 閉パネルのアイテムポップアップ処理
var panelPopper = function(){
	var $box = null;		// ポップアップ中のアイテムボックス
	var nextPanel = null;	// 次のポップアップパネル
	var itemTimer = null;	// アイテム追加setTimeout
	var mouseTimer = null;	// マウス監視setTimeout
	function nextpop(ev){
		if( $box ){
			if( elementHasXY( $box[0], ev.pageX, ev.pageY ) ) return;
			if( elementHasXY( $box[0].parentNode, ev.pageX, ev.pageY ) ) return;
			panelPopper(false);
			if( nextPanel && elementHasXY( nextPanel, ev.pageX, ev.pageY ) ){
				panelPopper( nextPanel, ev.pageX, ev.pageY );
			}
		}
		// IE8でなぜかこのあとmouseupが発生してSortableのドラッグが解除されてしまう問題の回避
		if( IE && IE<9 && ev.stopPropagation ) ev.stopPropagation();
	}
	return function( panel, prevX, prevY ){
		if( panel==false ){
			// ポップアップ解除
			clearTimeout( itemTimer );
			$document.off('mousemove.itempop');
			$box.hide().off().empty();
			$box = null;
		}
		else if( $box ){
			// ポップアップ中のため保留
			nextPanel = panel;
		}
		else{
			// ポップアップ実行
			clearTimeout( itemTimer );
			$box = $(panel).find('.itembox');
			var left = panel.offsetLeft + panel.offsetWidth -2;	// -2ちょい左
			// 右端にはみ出る場合は左側に出す
			if( left + panel.offsetWidth > $window.scrollLeft() + $window.width() )
				left = panel.offsetLeft - panel.offsetWidth +20;
			$box.addClass('itempop').css({
				left	:left
				,top	:panel.offsetTop -1		// ちょい上
				,width	:panel.offsetWidth -24	// 適当に幅狭く
			})
			.mouseleave( nextpop ).empty().show();
			// アイテム追加
			var child = tree.node( panel.id ).child;
			var length = child.length;
			var index = 0;
			var winScrollBottom = $window.scrollTop() + $window.height();
			var boxTopLimit = $window.scrollTop();
			var boxTop = $box.offset().top;
			if( tree.modified() || option.modified() ) boxTopLimit += $('#modified').height();
			if( boxTopLimit > boxTop ) boxTopLimit = boxTop;
			(function callee(){
				var count=10;
				while( index < length && count>0 ){
					if( !child[index].child ) $box.append( $newItem( child[index] ) );
					index++; count--;
				}
				// 下に隠れる場合は上に移動
				var hidden = boxTop + $box.height() - winScrollBottom;
				if( hidden >0 ){
					var newTop = boxTop - hidden -7; // -7pxなぜかもうちょい上
					if( newTop < boxTopLimit ) newTop = boxTopLimit;
					if( newTop != boxTop ){
						$box.css('top', newTop );
						boxTop = newTop;
					}
				}
				// 次
				if( index < length ) itemTimer = setTimeout(callee,0);
			}());
			// カーソル移動方向と停止時間を監視
			$document.on('mousemove.itempop',function(ev){
				// 範囲外で一定時間カーソルが止まったら消す
				clearTimeout( mouseTimer );
				mouseTimer = setTimeout(function(){ nextpop(ev); },200);
				// カーソル移動方向が範囲外なら消す
				var box = $box[0];
				var dx = ev.pageX - prevX;
				var dy = ev.pageY - prevY;
				if( Math.abs(dx) + Math.abs(dy) >3 ){	// 適当に溜めないとdx=0が頻発して問題
					var destX = box.offsetLeft;
					if( destX < ev.pageX ) destX += box.offsetWidth;
					var destY = (dx==0)?-999:(destX - ev.pageX) * dy / dx + ev.pageY;
					if( dx==0							// 垂直移動
						|| (dx>0 && destX < ev.pageX)	// 逆方向
						|| (dx<0 && ev.pageX < destX)	// 逆方向
						|| destY < box.offsetTop		// box範囲外方向
						|| destY > box.offsetTop + box.offsetHeight	// box範囲外方向
					){
						nextpop(ev);
					}
					prevX = ev.pageX;
					prevY = ev.pageY;
				}
			});
		}
	};
}();
// パネル開閉(開いてたら閉じ、閉じてたら開く)
function panelOpenClose( $panel, itemShow, pageX, pageY ){
	// 引数$panelはjQueryオブジェクトまたはパネルID(ノードID)文字列
	if( $panel instanceof jQuery ){
		var nodeID = $panel[0].id;
	}
	else{
		var nodeID = $panel;
		$panel = $('#'+$panel);
	}
	var $box = $panel.find('.itembox');
	var $btn = $panel.find('.plusminus');
	if( $btn.attr('src')=='plus.png' ){
		// 開く
		panelPopper(false);
		$panel.off('mouseenter.itempop');
		$box.off().css({position:'',width:''}).removeClass('itempop').empty().show();
		$btn.attr({ src:'minus.png', title:'閉じる' });
		// アイテム追加
		for( var child=tree.node( nodeID ).child, i=0, n=child.length; i<n; i++ ){
			if( !child[i].child )
				$box.append( $newItem( child[i] ) );
		}
	}else{
		// 閉じる(hoverでアイテムをポップアップ)
		// TODO:大量エントリで閉じパネルが多くなると、パネルタイトルは幅狭くていいから
		// 中身のポップアップの幅をもっと広くしたくなる。どうするか。設定で持つか？
		// TODO:吹き出しみたいな三角形あるといいかな？いらんかな。
		$box.hide().css('position','absolute').empty();
		$panel.on('mouseenter.itempop',function(ev){ panelPopper( this, ev.pageX, ev.pageY ); });
		$btn.attr({ src:'plus.png', title:'開く' });
		if( itemShow ) panelPopper( $panel[0], pageX, pageY );
	}
}
// パネル編集
// pid:パネルノードID
function panelEdit( pid ){
	var pnode = tree.node( pid );
	// パネル名
	var $pname = $('<a class=edit></a>')
		.append('<img class=icon src=folder.png>')
		.append( $('<input>').val( pnode.title ).css('font-weight','bold') );
	var $editbox = $('#editbox').empty().append( $pname );
	// アイテムボックス
	var $itembox = $('<div></div>').appendTo( $editbox );
	var $newurl = $('<input class=newurl title="新規ブックマークURL" placeholder="新規ブックマークURL">')
				.on('commit',function(){
					if( this.value.length ){
						var $item = $('<a class=edit></a>').attr('title',this.value);
						var $icon = $('<img class=icon src=item.png>');
						var $edit = $('<input>').width( $itembox.width() -64 ).val( this.value.noProto() );
						var $idel = $('<img class=idel src=delete.png title="削除">');
						// 新規登録ボタンの次に挿入
						$commit.after( $item.append($idel).append($icon).append($edit) );
						// URLタイトル、favicon取得
						$.get(':analyze?'+this.value.myURLenc(),function(data){
							if( data.title.length ) $edit.val( HTMLdec( data.title ) );
							if( data.icon.length ) $icon.attr('src',data.icon);
						});
						$commit.hide();
						this.value = '';
					}
				})
				.keypress(keypress).on('input keyup paste',function(){
					// 文字列がある時だけ登録ボタン表示
					// なぜかsetTimeout()しないと動かない…この時点ではvalueに値が入ってないからかな？
					setTimeout(function(){
						if( $newurl.val().length ) $commit.show();
						else $commit.hide();
					},10);
				})
				.appendTo( $itembox );
	var $commit = $('<a class=commit tabindex=0 style="display:block">↓↓↓新規登録↓↓↓</a>')
				.click(function(){ $newurl.trigger('commit'); })
				.keypress(keypress).appendTo( $itembox ).hide();
	// Enterで新規アイテム作成
	function keypress(ev){
		switch( ev.which || ev.keyCode || ev.charCode ){
		case 13: $newurl.trigger('commit').focus(); return false;
		}
	}
	// 削除ボタン
	var idels = [];
	$document.on('click.paneledit','#editbox .idel',function(){
		// 削除アイテムノードID配列
		if( this.parentNode.id ) idels.push( this.parentNode.id.slice(2) );
		$(this.parentNode).remove();
	});
	// アイテムループ
	var child = pnode.child;
	var index = 0, length = child.length;
	var timer = null;
	var $itembase = $('<a class=edit><img class=idel src=delete.png title="削除（ごみ箱）"><img class=icon><input></a>');
	(function callee(){
		var count=5;
		while( index < length && count>0 ){
			var node = child[index];
			if( !node.child ){
				var $e = $itembase.clone();
				$e[0].id = 'ed'+node.id;
				$e.find('.icon').attr('src', node.icon ||'item.png');
				$e.find('input').val( node.title );
				$itembox.append( $e );
			}
			index++; count--;
		}
		if( index < length ) timer = setTimeout(callee,0); else itemSortable();
	}());
	// ファビコンD&Dでアイテム並べ替え(TODO:Sortableとかぶる)
	function itemSortable(){
		$document.on('mousedown.paneledit','#editbox div .icon',function(ev){
			var item = this.parentNode;
			var downX = ev.pageX;
			var downY = ev.pageY;
			var $dragi = null;
			var $place = null;
			var scroll = null;
			$document.on('mousemove.paneledit',function(ev){
				if( (Math.abs(ev.pageX-downX) +Math.abs(ev.pageY-downY)) >10 ){
					// ドラッグ開始
					var $item = $(item);
					$dragi = $('<div class=edragi></div>').css({
								left:ev.pageX +5
								,top:ev.pageY +5
								,'z-index':$('.ui-dialog').css('z-index') // ダイアログの裏に隠れないよう
							})
							.text( $item.find('input').val() )
							.prepend( $item.find('.icon').clone() )
							.appendTo( document.body );
					$place = $('<hr class=place>');
					$item.css('opacity',0.3).after( $place );
					var scrollTop = $itembox.offset().top +30;
					var scrollBottom = scrollTop + $itembox.height() -60;
					var speed = 0;
					$document.off('mousemove.paneledit');
					$document.on('mousemove.paneledit',function(ev){
						// ドラッグ物移動
						$dragi.css({ left:ev.pageX +5, top:ev.pageY +5 });
						// スクロール
						speed = 0;
						if( ev.pageY < scrollTop ){
							speed = ev.pageY - scrollTop;
						}
						else if( ev.pageY > scrollBottom ){
							speed = ev.pageY - scrollBottom;
						}
						if( speed==0 ){
							clearInterval( scroll ); scroll=null;
						}
						else if( !scroll ){
							scroll = setInterval(function(){
								var old = $itembox.scrollTop();
								$itembox.scrollTop( old + speed );
								if( old==$itembox.scrollTop() ){
									clearInterval( scroll ); scroll=null;
								}
							},100);
						}
					});
					$document.on('mousemove.paneledit','#editbox div .edit',function(ev){
						// ドロップ場所移動
						var $this = $(this);
						if( ev.pageY < $this.offset().top + $this.height()/2 )
							$this.before( $place );
						else
							$this.after( $place );
					});
				}
			});
			$document.one('mouseup',function(){
				clearInterval( scroll );
				$document.off('mousemove.paneledit mouseleave.paneledit');
				if( $dragi ) $dragi.remove();
				if( $place ){
					$place.after( item );
					$place.remove();
				}
				$(item).css('opacity',1);
			});
			if( IE && IE<9 ){
				$document.on('mouseleave.paneledit',function(){
					$place.remove(); $place=null;
					$document.mouseup();
				});
				// IE8はなぜかエラー発生させればドラッグ可能になる…
				xxxxx;
			}
			// Firefoxはreturn falseしないとテキスト選択になってしまう…
			else return false;
		});
	}
	$editbox.dialog({
		title	:'パネル編集（パネル名・アイテム編集）'
		,modal	:true
		,width	:480
		,height	:425
		,close	:close
		,buttons:{
			' O K ':function(){
				// パネル名
				var $panel = $('#'+pid);
				var title = $pname.find('input').val();
				if( tree.nodeAttr( pid, 'title', title ) >1 ){
					$panel.find('.title').find('span').text( title );
				}
				// アイテム削除
				var idelsJSON = JSON.stringify(idels);	// JSON複製保持
				tree.moveChild( idels, tree.trash() );	// idelsは空になる
				idels = $.parseJSON(idelsJSON)			// 復元
				for( var i=idels.length-1; i>=0; i-- ) $('#'+idels[i]).remove();
				// アイテム変更
				var $panelbox = $panel.find('.itembox');
				$($itembox.children('.edit').get().reverse()).each(function(){
					var $this = $(this);
					if( this.id ){
						// 既存タイトル変更
						// nodeAttr/moveChildは処理内容が冗長だがまあいいか…
						var nid = this.id.slice(2);
						var title = $this.find('input').val();
						tree.nodeAttr( nid, 'title', title );
						tree.moveChild( [nid], pnode );
						$('#'+nid).prependTo( $panelbox ).attr('title',title).find('span').text( title );
					}
					else{
						// 新規登録
						var url = $this.attr('title');
						var icon = $this.find('.icon').attr('src');
						var title = $this.find('input').val();
						var node = tree.newURL( pnode, url, title, (icon=='item.png')?'':icon );
						$newItem( node ).prependTo( $panelbox );
					}
				});
				// おわり
				close();
			}
			,'キャンセル':close
		}
		,resize:function(){
			// TODO:メイリオとMSPゴシックで高さがイマイチ
			var timer = null;
			return function(){
				clearTimeout(timer);
				timer = setTimeout(function(){
					// $editbox.prev()はダイアログタイトルバー(<div class="ui-dialog-titlebar">)
					$itembox.height( $editbox.height() -$editbox.prev().height() -5 );
					$editbox.find('.edit input').width( $itembox.width() -64 );
				},20);
			};
		}()
	});
	function close(){
		clearTimeout(timer);
		$itembase.remove();
		$document.off('click.paneledit mousedown.paneledit');
		$editbox.dialog('destroy');
	}
}
// 変更保存
function modifySave( arg ){
	// 順番に保存
	$('#modified').hide();
	$('#progress').show();
	if( tree.modified() ) tree.save({ success:optionSave, error:err });
	else optionSave();

	function optionSave(){
		if( option.modified() ){
			option.save({ success:suc, error:err });
		}
		else suc();
	}
	function suc(){
		$('#progress').hide();
		$wall.css('padding-top','0');
		if( option.autoshot() ){
			$.ajax({
				url		 :':snapshot'
				,error	 :function(xhr){ Alert('スナップショット作成できませんでした:'+xhr.status+' '+xhr.statusText); }
				,complete:function(){ if( arg && arg.success ) arg.success(); }
			});
		}
		else if( arg && arg.success ) arg.success();
	}
	function err(){
		$('#progress').hide();
		$('#modified').show();
	}
}
// favicon解析してから移行データ取り込み
// TODO:Chromeで解析件数が多いとスキップしてもajax通信がいつまでたっても終わらず続いてしまう。
// abort()がぜんぜん効いていないかのよう…Chrome以外はわりとすぐ終わってくれるのに…
function analyzer( nodeTop ){
	var total = 0;			// URL総数
	var ajaxs = [];			// URL解析中配列
	var skipped = false;	// スキップフラグ
	function skip(){
		skipped = true;
		for( var i=ajaxs.length-1; i>=0; i-- ){
			ajaxs[i].xhr.abort();
			ajaxs[i].done = true;
		}
		$('#dialog').dialog('destroy');
		importer( nodeTop );
	}
	// プログレスバーつき進捗ダイアログ
	var $msg = $('<span></span>').text('ブックマークを解析しています...');
	var $pgbar = $('<div></div>').progressbar();
	var $count = $('<span></span>');
	$('#dialog').empty().append($msg).append($count).append('<br>').append($pgbar)
	.dialog({
		title	:'情報'
		,modal	:true
		,width	:400
		,height	:210
		,close	:skip
		,buttons:{ 'スキップして次に進む':skip }
	});
	// ajaxリクエスト
	(function ajaxer( node ){
		if( node.child ){
			for( var i=0, n=node.child.length; i<n; i++ ) ajaxer( node.child[i] );
		}
		else{
			total++;
			if( node.url.length && !node.icon.length ){
				var index = ajaxs.length;
				ajaxs[index] = {
					done: false
					,xhr: $.ajax({
						url		 :':analyze?'+node.url.myURLenc()
						,success :function(data){ if( data.icon.length ) node.icon = data.icon; }
						,complete:function(){ ajaxs[index].done = true; }
					})
				};
			}
		}
	}( nodeTop ));
	// 進捗表示
	$msg.text('ブックマーク'+total+'個のうち、'+ajaxs.length+'個のファビコンがありません。ファビコンを取得しています...' );
	$count.text('(0/'+ajaxs.length+')');
	$pgbar.progressbar('value',0);
	// 解析完了待ちループ
	(function waiter(){
		if( skipped ) return;
		var waiting=0;
		for( var i=ajaxs.length-1; i>=0; i-- ){
			if( !ajaxs[i].done ) waiting++;
		}
		if( waiting ){
			// 進捗表示
			var count = ajaxs.length - waiting;
			$count.text('('+count+'/'+ajaxs.length+')');
			$pgbar.progressbar('value',count*100/ajaxs.length);
			setTimeout(waiter,500);
			return;
		}
		// 完了
		$('#dialog').dialog('destroy');
		importer( nodeTop );
	}());
}
// 移行データ取り込み
function importer( nodeTop ){
	$('#dialog').html('現在のデータを破棄して、新しいデータに差し替えますか？<br>それとも追加登録しますか？')
	.dialog({
		title	:'データ取り込み方法の確認'
		,modal	:true
		,width	:410
		,height	:180
		,close	:function(){ $(this).dialog('destroy'); }
		,buttons:{
			'差し替える':function(){
				$(this).dialog('destroy');
				option.panel.layout({}).panel.status({});
				paneler( tree.replace(nodeTop).top() );
			}
			,'追加登録する':function(){
				$(this).dialog('destroy');
				paneler( tree.mount(nodeTop.child[0]).top() );
			}
			,'キャンセル':function(){ $(this).dialog('destroy'); }
		}
	});
}
// ドラッグ中スクロール制御
// TODO:スクロール後にマウス動かさないとドロップ場所がついてこない。
var scroller = function(){
	var timer = null;
	return function( ev ){
		clearTimeout( timer );
		if( ev ){
			var dx=0, dy=0;
			if( ev.clientX <=40 ){
				dx = ev.clientX -40;
			}
			else if( ev.clientX >=$window.width() -40 ){
				dx = 40 -($window.width() -ev.clientX);
			}
			if( ev.clientY <=40 ){
				dy = ev.clientY -40;
			}
			else if( ev.clientY >=$window.height() -40 ){
				dy = 40 -($window.height() -ev.clientY);
			}
			if( dx!=0 || dy!=0 ){
				(function callee(){
					var oldLeft = $window.scrollLeft();
					var oldTop = $window.scrollTop();
					scrollTo( oldLeft + dx, oldTop + dy );
					if( $window.scrollLeft()!=oldLeft || $window.scrollTop()!=oldTop ){
						timer = setTimeout(callee,100);
					}
				}());
			}
		}
	};
}();
// D&D並べ替え
function Sortable( sort ){
	var isDrag = false;
	$document.on('mousedown', '.'+sort.itemClass, function(ev){
		// 新規ブックマーク入力欄と登録ボタンは何もしない
		// TODO:.panelだけで必要(.itemは不要)な処理だけどまあいいか…
		if( ev.target.id=='newurl' ) return;
		if( ev.target.id=='commit' ) return false;
		var element = this;
		var downX = ev.pageX;
		var downY = ev.pageY;
		var $dragi = null;	// ドラッグ物
		var $place = null;	// ドロップ場所
		// ドラッグ判定イベント
		$document.on('mousemove.sortable',function(ev){
			if( (Math.abs(ev.pageX-downX) +Math.abs(ev.pageY-downY)) > sort.distance ){
				// ある程度カーソル移動したらドラッグ開始
				$dragi = sort.start( element );
				$place = sort.place( element );
				if( $dragi instanceof jQuery && $place instanceof jQuery ){
					isDrag = true;
					// ドラッグ物
					$dragi.css({ left:ev.pageX+5, top:ev.pageY+5 });
					// ドロップ場所
					if( ev.pageY <= element.offsetTop + element.offsetHeight/2 )
						$(element).before( $place );
					else
						$(element).after( $place );
					// ドラッグ中イベント
					$document.off('mousemove.sortable')
					.on('mousemove.sortable',function(ev){
						// ドラッグ物
						$dragi.css({ left:ev.pageX+5, top:ev.pageY+5 });
						// 個別処理
						if( sort.onDrag ) sort.onDrag( ev, $dragi, $place );
						// スクロール制御
						scroller(ev);
					})
					.on('mousemove.sortable', '.'+sort.itemClass+', .'+sort.boxClass, function(ev){
						// ドロップ場所
						if( elementHasXY( $dragi[0], ev.pageX, ev.pageY ) ) return;
						if( elementHasXY( $place[0], ev.pageX, ev.pageY ) ) return;
						var $this = $(this);
						if( $this.hasClass( sort.itemClass ) ){
							// offsetTopは親要素(.itembox)からの相対値になってしまうのでoffset().top利用
							if( ev.pageY <= $this.offset().top + this.offsetHeight/2 ){
								if( $this.prev() != $place ) $this.before( $place );
							}
							else{
								if( $this.next() != $place ) $this.after( $place );
							}
						}
						else if( $this.hasClass( sort.boxClass ) ){
							if( !this.childNodes.length ) $this.append( $place );
						}
					});
					// IE8
					if( IE && IE<9 ){
						// IE8はウィンドウ外へドラッグするとイベントが来なくなる。外でもボタンを離さず
						// 戻ってくれば問題ないが、外でボタンを離して戻った場合、(mouseupが来ないため
						// ドロップできず)ボタンを押してないのに表示上ドラッグしたままという変な状態に
						// なる。jQuery(jquery.ui.mouse.js)では、mousemoveでボタンが押されていなければ
						// ドラッグ終了にするhackがあるようだが、
						// https://github.com/jquery/jquery-ui/blob/master/ui/jquery.ui.mouse.js
						// IE mouseup check - mouseup happened when mouse was out of window
						// if ($.ui.ie && ( !document.documentMode || document.documentMode < 9 ) && !event.button) {
						//   return this._mouseUp(event);
						// }
						// これを真似して、mousemoveの先頭で
						// if( IE && IE<9 && !ev.button ) return $document.mouseup();
						// としてみたところ、ドラッグ開始後にその要素が元あった場所に入るとなぜかmouseup
						// が発生してドラッグ終了してしまうイヤな挙動になった。なぜ？？？わからないので、
						// IE8はウィンドウ外に出たらドラッグ中止する。
						// ちなみにjQueryでも、ウィンドウ外でボタンを離したあと、また押した状態で戻って
						// きた場合は、ドラッグが中断したまま動かない表示になる。
						$document.on('mouseleave.sortable',function(){
							$(element).after($place);	// 元の場所で
							$document.mouseup();		// ドロップ
						});
					}
				}
			}
		})
		.one('mouseup',function(ev){
			// スクロール停止
			scroller(false);
			// イベント解除
			$document.off('mousemove.sortable mouseleave.sortable');
			// ドロップ
			if( isDrag ){
				sort.stop( $dragi, $place );
				isDrag = false;
			}
		})
		// 右クリックメニューが消えなくなったのでここで実行
		.trigger('mousedown');
		// IE8はなぜかエラー発生させれば.itemドラッグ可能になる…
		if( IE && IE<9 ) xxxxx;
		// Firefoxはreturn falseしないとテキスト選択になってしまう…
		else return false;
	});
}
// パラメータ変更反映
function optionApply(){
	var fontSize = option.font.size();
	var iconSize = option.icon.size();
	var panelWidth = option.panel.width();
	var panelMarginTop = option.panel.margin.top();
	var panelMarginLeft = option.panel.margin.left();
	var columnWidth = panelWidth +panelMarginLeft +2;	// +2 適当たぶんボーダーぶん
	$wall.width( columnWidth *option.column.count() ).css({
		'padding-right': panelMarginLeft +'px'
	});
	$('.column').width( columnWidth );
	$('.panel').width( panelWidth ).css({
		'font-size': fontSize +'px'
		,margin: panelMarginTop +'px 0 0 ' +panelMarginLeft +'px'
	});
	$('.title span').css('vertical-align',(iconSize/2)|0);
	$('.item span').css('vertical-align',(iconSize/2)|0);
	$('.icon').width( fontSize +3 +iconSize ).height( fontSize +3 +iconSize );
	$('.pen, .plusminus').width( fontSize +iconSize ).height( fontSize +iconSize );
	$('#newurl').css('font-size',fontSize);
	// パネル元要素
	$panelBase.width( panelWidth ).css({
		'font-size': fontSize +'px'
		,margin: panelMarginTop +'px 0 0 ' +panelMarginLeft +'px'
	});
	$panelBase.find('.title span').css('vertical-align',(iconSize/2)|0);
	$panelBase.find('.icon').width( fontSize +3 +iconSize ).height( fontSize +3 +iconSize );
	$panelBase.find('.pen, .plusminus').width( fontSize +iconSize ).height( fontSize +iconSize );
	// パネルアイテム元要素
	$itemBase.find('span').css('vertical-align',(iconSize/2)|0 );
	$itemBase.find('.icon').width( fontSize +3 +iconSize ).height( fontSize +3 +iconSize );
}
// カラム数変更
function columnCountChange( count ){
	if( count.prev < count.next ){
		// カラム増える
		var width = $('#co0').width();		// 1列目(co0)と同じ幅
		var $br = $wall.children('br');		// 最後の<br class=clear>
		for( var i=count.prev, n=count.next; i<n; i++ ){
			$br.before( $('<div id=co'+i+' class=column></div>').width( width ) );
		}
	}
	else if( count.prev > count.next ){
		// カラム減る
		var $column = [];						// カラムオブジェクト配列
		for( var i=0, n=count.prev; i<n; i++ ){
			$column[i] = $('#co'+i);
		}
		// 消えるカラムにあるパネルを残るカラムに分配
		var distination=0;
		for( var i=count.next, n=count.prev; i<n; i++ ){
			$column[i].find('.panel').each(function(){
				$(this).appendTo( $column[distination%count.next] );
				distination++;
			});
			// 分配おわりカラムDOMエレメント削除
			$column[i].remove();
		}
	}
}
// 一行入力ダイアログ
function InputDialog( arg ){
	var $input = $('<input>').width(240).css('padding-left',2)
	.keypress(function(ev){
		switch( ev.which || ev.keyCode || ev.charCode ){
		case 13: ok(); return false; // Enterで反映
		}
	});
	$('#dialog').empty().text(arg.text+' ').append($input).dialog({
		title	:arg.title
		,modal	:true
		,width	:365
		,height	:170
		,close	:close
		,buttons:{ ' O K ':ok, 'キャンセル':close }
	});
	function ok(){ arg.ok( $input.val() ); close(); }
	function close(){ $input.remove(); $('#dialog').dialog('destroy'); }
}
// 確認ダイアログ
// IE8でなぜか改行コード(\n)の<br>置換(replace)が効かないので、しょうがなく #BR# という
// 独自改行コードを導入。Chrome/Firefoxは単純に \n でうまくいくのにIE8だけまた・・
function Confirm( arg ){
	var opt ={
		title	:arg.title ||'確認'
		,modal	:true
		,width	:365
		,height	:190
		,close	:function(){ $(this).dialog('destroy'); }
		,buttons:{}
	};
	if( arg.ok )  opt.buttons['O K']    = function(){ $(this).dialog('destroy'); arg.ok(); }
	if( arg.yes ) opt.buttons['はい']   = function(){ $(this).dialog('destroy'); arg.yes(); }
	if( arg.no )  opt.buttons['いいえ'] = function(){ $(this).dialog('destroy'); arg.no(); }
	opt.buttons['キャンセル'] = function(){ $(this).dialog('destroy'); }

	if( arg.width ){
		var maxWidth = $window.width() -100;
		if( arg.width > maxWidth ) arg.width = maxWidth;
		else if( arg.width < 300 ) arg.width = 300;
		opt.width = arg.width;
	}
	if( arg.height ){
		var maxHeight = $window.height() -100;
		if( arg.height > maxHeight ) arg.height = maxHeight;
		else if( arg.height < 150 ) arg.height = 150;
		opt.height = arg.height;
	}

	$('#dialog').empty().html( HTMLenc(arg.msg).replace(/#BR#/g,'<br>') ).dialog( opt );
}
// 警告ダイアログ
function Alert( msg ){
	$('#dialog').empty().html( HTMLenc(''+msg).replace(/#BR#/g,'<br>') ).dialog({
		title	:'通知'
		,modal	:true
		,width	:360
		,height	:160
		,close	:function(){ $(this).dialog('destroy'); }
		,buttons:{ 'O K':function(){ $(this).dialog('destroy'); } }
	});
}
// メッセージボックス
function MsgBox( msg ){
	$('#dialog').empty().text(msg).dialog({
		title	:'情報'
		,modal	:true
		,width	:300
		,height	:100
	});
}
// HTMLエンコード
function HTMLenc( html ){
	var $a = $('<a/>');
	var enc = $a.text(html).html();
	$a.remove();
	return enc;
}
// サイトのタイトルに含まれる文字参照(&#39;とか)をデコードする。
// 通常はないがもしタイトルにタグや<script>が含まれている場合、そのまま
// jQuery.html().text()すると<script>が消えてしまうので、あらかじめ <>
// は文字参照にエンコードして渡す。テストサイトでタイトルに<h1>,<script>
// &,&amp;などを入れて動作確認。
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
// Twitterで昔http://twitter.com/#!/hogeなど'#'が含まれるURLがあり、$.get()で
// '#'以降の文字列が消えてリクエストされてしまっていた。'#'がページ内リンクと
// みなされて消される？jQueryの仕様？encodeURIComponent()を使えば'#'を'%23'に
// エンコードできるが、他にもいっぱいエンコードされてサーバ側のデコード処理が
// たいへん。'#'以外は$.get()が自動でエンコードしてくれる内容で問題なさそうな
// のでそうしたい。とりあえず'#'だけ'%23'に置換して送信する。Twitterサーバは
// '#'が'%23'になってると404を返すので、サーバ側で'#'に戻してリクエストを送る。
// が、Twitterはいまは/#!/の応答では200を返すけどタイトルは単なる「Twitter」で、
// 結局/#!/無しURLにリダイレクトされるようだ。他サイトで悪影響が出ないといいが…
// 知らなかったがescape()関数もあったようだ。これは#を%23にしてくれるが…
// http://groundwalker.com/blog/2007/02/javascript_escape_encodeuri_encodeuricomponent_.html
// まあいいかとりあえず動いてるし…。と思ったが、http://homepage1.nifty.com/herumi/diary/1303.html#15
// がエラーになってしまうので、#! を %23! に置換することにした。これで通常の
// ページ内リンクは削除されたURLがリクエストされることに。だいじょぶかな？
String.prototype.myURLenc = function(){ return this.replace(/#!/g,'%23!'); };
//
String.prototype.noProto = function(){ return this.replace(/^https?:\/\//,''); };

}($));
