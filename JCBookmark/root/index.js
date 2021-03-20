// vim:set ts=4 noexpandtab:vim modeline
// TODO:PDFなどメジャーなファイル形式のブックマークアイテムのアイコンを既定で持つ。PDFはpublic domainのpng画像があるようだが(http://commons.wikimedia.org/wiki/File:Adobe_PDF_icon.png)、16x16にするとちょっと潰れてしまう。
// TODO:外出先でブックマーク更新したの忘れて自宅で変更を消してしまうことしばしば・・。やはりそうならないような仕組みで動かしたい。とりあえず「いま表示してるデータが古くなった」事を検知する仕組みが必要か・・。
// TODO:Chromeのブックマークバーみたいな固定バーが欲しい。パネルの右クリックメニュー「このタブを固定」でスタイル変更。新規ブックマーク登録ボックスも一緒に入るのはいいが新規登録ボタン(文字が入ってる時だけ表示)をどうするか。あと１行で収まらない時は２行でいいかな？
// TODO:一括でパネル開閉
// TODO:パネルの中にパネル、ポップアップは１列だけでなくドラッグで横に引き伸ばして複数列にできる、ポップアップ内でもパネル開閉ができる、ようするにポップアップはwallが出たり消えたりする感じ。配置を設定に持つのが大変そうだが・・
// TODO:パネル色分け。背景が黒か白かは固定で、色相だけ選べる感じかな？HSVのSVは固定で。
// TODO:Firefoxのタグ機能。整理画面はFirefox相当でいいけどパネル画面はタグ機能をどう使うか・・タグパネル？無視？
// TODO:ブックマークデータの複数切り替え。tree.jsonとindex.jsonのセットを複数持てばいいのだが、スナップショットとの整合もある。または、データは１つのまま表示上#wallを複数にしてタブ切り替えという方式でもいいかな。どちらがよいか・・。タブ切り替え型ならパネル持ち運びができるのが利点か。データ切り替え型は・・大量データの場合に負荷が低いかな。
(function( $, $win, $doc, oStr, IE, $wall, $sidebar ){
'use strict';
/*
var $debug = $('<div></div>').css({
		position:'fixed'
		,left:0
		,top:0
		,width:200
		,background:'#fff'
		,border:'1px solid #000'
		,padding:2
}).appendTo(document.body);
var start = new Date(); // 測定
*/
$.ajaxSetup({
	// ブラウザキャッシュ(主にIE)対策 http://d.hatena.ne.jp/hasegawayosuke/20090925/p1
	headers:{'If-Modified-Since':'Thu, 01 Jun 1970 00:00:00 GMT'}
});
WebBookmarkCallback();
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
				$wall.css('padding-top',h);
				$('.itempop').each(function(){ if( this.offsetTop<h ) $(this).css('top',h); });
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
		$('#foundbox').empty(); // 検索結果矛盾するのでクリア
		return tree;
	}
	// 指定IDのchildに接ぎ木
	,mount:function( subtree ){
		// ノードIDつけて
		(function callee( node ){
			node.id = tree.root.nextid++;
			if( node.child ) for( var i=0, n=node.child.length; i<n; i++ ) callee( node.child[i] );
		}( subtree ));
		// トップノード(固定)child配列に登録
		tree.top().child.push( subtree ); // 最後に
		tree.modified(true);
		return tree;
	}
	// トップノード取得
	,top:function(){ return tree.root.child[0]; }
	// ごみ箱ノード取得
	,trash:function(){ return tree.root.child[1]; }
	// 指定ノードIDを持つノードオブジェクト(既定はごみ箱は探さない)
	,node:function( id, root ){
		return function callee( node ){
			if( node.id==id ) return node; // 見つけた
			if( node.child ){
				for( var i=node.child.length; i--; ){
					var found = callee( node.child[i] );
					if( found ) return found;
				}
			}
			return null;
		}( root || tree.top() );
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
		function save(){
			$.ajax({
				type:'put'
				,url:'tree.json'
				,data:JSON.stringify( tree.root )
				,error:function(xhr){
					if( xhr.status===401 ) LoginDialog({ ok:save ,cancel:giveup });
					else giveup();

					function giveup(){
						Alert('保存できません:'+xhr.status+' '+xhr.statusText);
						if( arg.error ) arg.error();
					}
				}
				,success:function(){
					tree.modified(false);
					if( arg.success ) arg.success();
				}
			});
		}
		save();
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
				if( node.child[i].id==id ) return node; // 見つけた
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
				}( tree.root.child ));
				// 貼り付け
				if( clipboard.length ){
					//for( var i=0; i<clipboard.length; i++ ) dst.child.push( clipboard[i] ); // 末尾に
					for( var i=clipboard.length; i--; ) dst.child.unshift( clipboard[i] ); // 先頭に
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
						if( ids.length && child[i].child ) callee( child[i].child );
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
// パネルオプション
// TODO:v1.8でpanel.marginをtop,leftに分けたので、v1.7以前のバージョンでこのindex.jsonを読み込んだら
// 正常動作しなそう。古いバージョンに戻しても問題ないかこれまで確認してきていない。戻したい人がいる
// かもだが、動作確認たいへんだし制約が増えるのはやだなぁ…。
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
				var h = $('#modified').show().outerHeight();
				$wall.css('padding-top',h);
				$('.itempop').each(function(){ if( this.offsetTop<h ) $(this).css('top',h); });
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
			$('#autoshot').prop('checked', data.autoshot );
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
			if( page.title===null ) page.title = 'ブックマーク';
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
			if( color.css==='' ) color.css = 'black.css';
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
			if( wall.margin==='' ) wall.margin = 'auto';
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
			if( font.css==='' ) font.css = 'gothic.css';
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
			if( column.count<0 ){
				// 一度目の参照時に規定値を設定
				column.count = $win.width() /230 |0;
				if( column.count==0 ) column.count = 1;
			}
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
				option.save({ error:function(){ option.modified(true); } });
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
			if( panel.width<0 ) panel.width = (($win.width() -27) /option.column.count() -option.panel.margin.left())|0;
			return panel.width;
		}
	}
	,autoshot:function( val ){
		if( arguments.length ){
			option.data.autoshot = val;
			$('#autoshot').prop('checked',val);
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
		function save(){
			$.ajax({
				type:'put'
				,url:'index.json'
				,data:JSON.stringify( option.data )
				,error:function(xhr){
					if( xhr.status===401 ) LoginDialog({ ok:save ,cancel:function(){ giveup(xhr); } });
					else giveup(xhr);
				}
				,success:function(){
					if( option_filer ) $.ajax({
						type:'put'
						,url:'filer.json'
						,data:JSON.stringify( option_filer )
						,error:giveup
						,success:success
					});
					else success();
				}
			});
		}
		function success(){
			option.modified(false);
			if( arg.success ) arg.success();
		}
		function giveup(xhr){
			Alert('保存できません:'+xhr.status+' '+xhr.statusText);
			if( arg.error ) arg.error();
		}
		save();
		return option;
	}
};
// filer.jsonデータ(インポート／スナップショット復元時のみ)
var option_filer = null;
// ブックマークデータ取得
(function(){
	var $loading = $('<div style="color:#888;text-align:center;">データ取得中...</div>');
	var option_ok = false;
	var tree_ok = false;
	option.load(function(){
		panelReady();
		// 表示(チラツキ低減)
		$loading.prependTo( $('body').css('visibility','visible') );
		option_ok=true; if( tree_ok ) go();
	});
	tree.load(function(){ tree_ok=true; if( option_ok ) go(); });
	function go(){ $loading.remove(); paneler( tree.top(), setEvents ); }
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
	var $p = $panelBase.clone();
	$p[0].id = node.id;
	$p.find('span').text( node.title );
	$p.find('.plusminus')[0].id = 'btn'+node.id;
	return $p;
}
// パネルアイテム生成関数
var $itemBase = $('<a class=item target="_blank"><img class=icon><span></span></a>');
function $newItem( node ){
	var $i = $itemBase.clone().attr({
		id		:node.id
		,href	:node.url
		,title	:node.title
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
		// カラム(段)生成
		var columnCount = option.column.count();
		var columns = {};
		for( var i=0; i<columnCount; i++ ){
			columns['co'+i] = {
				$e: $column( 'co'+i ).appendTo( $wall )
				,height: 0
			};
		}
		// float解除
		$wall.append('<br class=clear>');
		// キーがノードID、値がパネル(フォルダ)ノードの連想配列
		// tree.node()を使うよりわずかに速くなるが体感は大差ない
		// やはりDOM追加描画にかかる時間が大きいようだ
		// IE8で245s→206s Firefoxで86s→81s Chromium31で39s→44s
		var panelNode = {};
		panelNode[ nodeTop.id ] = nodeTop;
		(function panelNoder( child ){
			for( var i=child.length; i--; ){
				if( child[i].child ){
					panelNode[ child[i].id ] = child[i];
					panelNoder( child[i].child );
				}
			}
		})( nodeTop.child );
		// レイアウト保存データのパネル配置
		// キーがカラム(段)ID、値がパネルIDの配列(上から順)の連想配列
		// 例) { co0:[1,22,120,45], co1:[3,5,89], ... }
		var panelLayout = option.panel.layout();
		var panelStatus = option.panel.status();
		var placeList = {}; // 配置が完了したパネルリスト: キーがパネルID、値はtrue
		var panels = [];	// 上方にあるパネル順(生成する順)に並べた配列
		var index = 0;
		for( ;; ){
			var done = true;
			for( var coID in panelLayout ){
				var coN = panelLayout[coID];
				if( index < coN.length ){
					var node = panelNode[ coN[index] ]; // tree.node( coN[index] );
					if( node ) panels.push({ node:node ,column:columns[coID] });
					done = false;
				}
			}
			if( done ) break; else index++;
		}
		index = 0;
		(function layouter(){
			var count = 10; // TODO:HW性能により動的可変になるとよい
			while( index < panels.length && count ){
				var panel = panels[index];
				panelCreate( panel.node ,panel.column );
				index++ ,count--;
			}
			if( index < panels.length ) timer = setTimeout(layouter,0); else afterLayout();
		})();
		// パネル１つ生成配置
		function panelCreate( node, column ){
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
					if( !child[i].child ) $box.append( $newItem( child[i] ) );
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
				if( !(node.id in placeList) ) nodeList.push( node );
				for( var i=0, n=node.child.length; i<n; i++ ){
					if( node.child[i].child ){
						lister( node.child[i] );
					}
				}
			}( nodeTop ));
			var index=0, length=nodeList.length;
			(function placer(){
				var count = 5;
				while( index < length && count>0 ){
					panelCreate( nodeList[index], lowestColumn() );
					index++; count--;
				}
				if( index < length ) timer = setTimeout(placer,0); else afterPlaced();
			})();
		}
		// 全パネル配置後
		function afterPlaced(){
			var fontSize = option.font.size();
			// 新規URL投入BOX作成
			$('#'+nodeTop.id).find('.itembox').before(
				$('<input id=newurl title="新規ブックマークURL" placeholder="新規ブックマークURL">')
				.css('font-size',fontSize).height( fontSize +3 )
				.on({
					// 新規登録
					commit:function(){
						var url = this.value;
						var node = tree.newURL( tree.top(), url, url.noProto() );
						if( node ){
							analyze();
							$newItem(node).prependTo( $(this.parentNode).find('.itembox') );
							$('#commit').remove();
							this.value = '';
						}
						// URLタイトル/favicon取得
						function analyze(){
							tree.modifing(true);
							$.ajax({
								type:'post'
								,url:':analyze'
								,data:url +'\r\n'
								,error:function(xhr){ if( xhr.status===401 ) LoginDialog({ ok:analyze }); }
								,success:function(data){
									data = data[0];
									if( data.title.length ){
										data.title = HTMLdec( data.title );
										if( tree.nodeAttr( node.id, 'title', data.title ) >1 )
											$('#'+node.id).attr('title',data.title).find('span').text(data.title);
									}
									if( data.icon.length ){
										if( tree.nodeAttr( node.id, 'icon', data.icon ) >1 )
											$('#'+node.id).find('img').attr('src',data.icon);
									}
								}
								,complete:function(){ tree.modifing(false); } // 編集完了
							});
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
			columnHeightAdjust();
			if( postEvent ) postEvent();
			// 測定
			//$debug.text('paneler='+((new Date()).getTime() -start.getTime())+'ms');
		}
	};
}();
// カラム高さ揃え
function columnHeightAdjust(){
	var height = 0;
	var padding = 50; // 50px初期値
	var columns = $wall.children('.column');
	for( var i=columns.length; i--; ){
		if( height < $(columns[i]).height() ) height = $(columns[i]).height();
	}
	if( $('#findtab').css('display')!='none' ) padding += $('#findtab').outerHeight();
	if( $('#findbox').css('display')!='none' ) padding += $('#findbox').outerHeight();
	for( var i=columns.length; i--; ){
		columns[i].style.paddingBottom = height - $(columns[i]).height() + padding +'px';
	}
}
function setEvents(){
	// ブラウザ情報＋インポートイベント
	(function(){
		var browser = { ie:1, edge:1, chrome:1, firefox:1 };
		$.ajax({
			url:':browser.json'
			,success:function(data){ browser = data; }
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
							msg:'Chromeブックマークデータを取り込みます。#BR#データ量が多いと時間がかかります。'
							,ok:function(){
								function ajax(){
									MsgBox('処理中です...');
									var time = (new Date()).getTime();
									$.ajax({
										url:':chrome.json?'+ time
										,error:function(xhr){
											$('#dialog').dialog('destroy');
											if( xhr.status===401 ) LoginDialog({ ok:ajax ,cancel:giveup });
											else giveup();

											function giveup(){
												Alert('データ取得エラー:'+xhr.status+' '+xhr.statusText);
											}
										}
										,success:function( data ){
											bookmarks = data;
											$.ajax({
												url:':chrome.icon.json?'+ time
												,success:function(data){ favicons = data; }
												,complete:doImport
											});
										}
									});
								}
								ajax();
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
							$('#dialog').dialog('destroy'); analyzer( root );
						}
					});
				}
				else{ $('#chromeico').hide(); sidebarHeight -=34; }

				if( 'ie' in browser ){
					// IEお気に入りインポート
					$('#ieico').click(function(){
						Confirm({
							msg:'Internet Explorer お気に入りデータを取り込みます。#BR#データ量が多いと時間がかかります。'
							,width:390
							,ok:function(){
								function ajax(){
									MsgBox('処理中です...');
									$.ajax({
										url:':favorites.json?'+ (new Date()).getTime()
										,error:function(xhr){
											$('#dialog').dialog('destroy');
											if( xhr.status===401 ) LoginDialog({ ok:ajax ,cancel:giveup });
											else giveup();

											function giveup(){
												Alert('データ取得エラー:'+xhr.status+' '+xhr.statusText);
											}
										}
										,success:function(data){
											$('#dialog').dialog('destroy'); analyzer( data );
										}
									});
								}
								ajax();
							}
						});
					});
				}
				else{ $('#ieico').hide(); sidebarHeight -=34; }

				if( 'edge' in browser ){
					// Edgeお気に入りインポート
					$('#edgeico').click(function(){
						Confirm({
							msg:'Microsoft Edge お気に入りデータを取り込みます。#BR#データ量が多いと時間がかかります。#BR##BR#Edge起動中でお気に入り編集した場合はエラーが発生する事があります。Edgeを終了してから実行してください。'
							,width:390
							,height:260
							,ok:function(){
								function ajax(){
									MsgBox('処理中です...');
									$.ajax({
										url:':edge-favorites.json?'+ (new Date()).getTime()
										,error:function(xhr){
											$('#dialog').dialog('destroy');
											if( xhr.status===401 ) LoginDialog({ ok:ajax ,cancel:giveup });
											else giveup();

											function giveup(){
												Alert('データ取得エラー:'+xhr.status+' '+xhr.statusText);
											}
										}
										,success:function(data){
											$('#dialog').dialog('destroy'); analyzer( data );
										}
									});
								}
								ajax();
							}
						});
					});
				}
				else{ $('#edgeico').hide(); sidebarHeight -=34; }

				if( 'firefox' in browser ){
					// Firefoxブックマークインポート
					$('#firefoxico').click(function(){
						Confirm({
							msg:'Firefoxブックマークデータを取り込みます。#BR#データ量が多いと時間がかかります。'
							,ok:function(){
								function ajax(){
									MsgBox('処理中です...');
									$.ajax({
										url:':firefox.json?'+ (new Date()).getTime()
										,error:function(xhr){
											$('#dialog').dialog('destroy');
											if( xhr.status===401 ) LoginDialog({ ok:ajax ,cancel:giveup });
											else giveup();

											function giveup(){
												Alert('データ取得エラー:'+xhr.status+' '+xhr.statusText);
											}
										}
										,success:function(data){
											$('#dialog').dialog('destroy'); analyzer( data );
										}
									});
								}
								ajax();
							}
						});
					});
				}
				else{ $('#firefoxico').hide(); sidebarHeight -=34; }

				// サイドバーちょっと動かす
				$doc.trigger('mousemove.sidebar',['show']);
				setTimeout(function(){ $doc.trigger('mousemove.sidebar',['hide']); },250);
			}
		});
	})();
	// サイドバーにマウスカーソル近づいたらスライド出現させる。
	// #sidebar の width を 34px → 65px に変化させる。index.css とおなじ値を使う必要あり。
	var sidebarHeight = 405;
	$doc.on('mousemove.sidebar',function(){
		var animate = null;
		return function(ev, trigger){
			// trigger
			switch( trigger ){
			case 'show': ev = { clientX:0, clientY:0 }; break;
			case 'hide': ev = { clientX:99 }; break;
			}
			// 近づいたら出す
			if( ev.clientX <37 && ev.clientY <sidebarHeight ){
				if( !$sidebar.hasClass('show') ){
					animate = $sidebar.addClass('show').stop().animate({width:65},'fast');
				}
			}
			// 離れたら収納
			else if( $sidebar.hasClass('show') ){
				animate = $sidebar.removeClass('show').stop().animate({width:34},'fast');
			}
		};
	}())
	// カラム右クリック新規パネル作成メニュー
	.on('contextmenu','.column',function(ev){
		var column = null;	// 新規パネルが入るカラム
		var above = null;	// 新規パネルの上のパネル
		var below = null;	// 新規パネルの下のパネル
		var $panels = $(this).children('.panel');
		if( $panels.length ){
			if( ev.pageX < $panels[0].offsetLeft ){
				return true;			// パネル左右余白クリック無視
			}
			if( ev.pageY < $panels[0].offsetTop ){
				below = $panels[0];		// 一番上に新規パネル
			}
			var panel = $panels[$panels.length-1];
			if( panel.offsetTop +panel.offsetHeight < ev.pageY ){
				above = panel;			// 一番下に新規パネル
			}
			for( var i=$panels.length; i--; ){
				if( ev.pageY < $panels[i].offsetTop &&
					$panels[i-1].offsetTop +$panels[i-1].offsetHeight < ev.pageY ){
					below = $panels[i]; // パネルとパネルの間
				}
			}
		}
		else column = this; // 空カラムに新規パネル
		if( column || above || below ){
			var $menu = $('#contextmenu');
			var $box = $menu.children('div').empty();
			$box.append($('<a><img src=newfolder.png>新規パネル作成</a>').click(function(){
				$menu.hide();
				// TODO:入力ダイアログは視線移動/マウス移動が多いから使わないUIの方がよいとは思うが
				// パネルの場所をそのままで編集できるUIが必要かな・・それはなかなか難しい。
				InputDialog({
					title:'新規パネル作成'
					,text:'パネル名',val:'新規パネル'
					,ok:function( name ){
						var node = tree.newFolder( name ||'新規パネル' );
						var $p = $newPanel( node );
						if( column ) $(column).append( $p );
						else if( above ) $(above).after( $p );
						else if( below ) $(below).before( $p );
						option.panel.layouted();
						columnHeightAdjust();
					}
				});
			}))
			.append($('<a><img src=cabinet.png>空カラム(列)を挿入</a>').click(function(){
				$menu.hide();
				if( !column ) column = (above || below).parentNode;
				var $col = $(column);
				// 作成
				$col.before( $('<div class=column></div>').width( $col.width() ) );
				option.column.count( option.column.count()+1 );
				// ID付け直し
				$wall.children('.column').removeAttr('id').each(function(i){ $(this).attr('id','co'+i); });
				// サイズ調整
				$wall.width( $col.outerWidth() * option.column.count() );
				columnHeightAdjust();
				// レイアウト設定
				option.panel.layouted();
			}));
			if( column ){
				// 空カラム
				$box.append($('<a><img src=delete.png>カラム(列)を削除</a>').click(function(){
					$menu.hide();
					// 削除
					option.column.count( option.column.count()-1 );
					$wall.width( $(column).outerWidth() * option.column.count() );
					$(column).remove();
					// ID付け直し
					$wall.children('.column').removeAttr('id').each(function(i){ $(this).attr('id','co'+i); });
					// レイアウト設定
					option.panel.layouted();
				}));
			}
			// メニュー表示
			$menu.width(190).css({
				left: (($win.width() -ev.clientX) <$menu.width())? ev.pageX -$menu.width() : ev.pageX
				,top: (($win.height() -ev.clientY) <$menu.height())? ev.pageY -$menu.height() : ev.pageY
			})
			.show();
			return false;
		}
		return true; // 既定右クリックメニュー
	});
	// パネル右クリックメニュー
	var isLocalServer = true;
	$.ajax({ url:':clipboard.txt' ,error:function(xhr){ if( xhr.status===403 ) isLocalServer=false; } });
	$doc.on('contextmenu','.title',function(ev){
		// ev.targetはクリックした場所にあるDOMエレメント
		var panel = ev.target;
		while( panel.className !='panel' ){
			if( !panel.parentNode ) break;
			panel = panel.parentNode;
		}
		var $menu = $('#contextmenu');
		var $box = $menu.children('div').empty();
		if( isLocalServer ){
			$box.append($('<a><img src=item.png>クリップボードのURLを新規登録</a>').click(function(){
				$menu.hide();
				var start = function(){
					$.ajax({
						type:'get'
						,url:':clipboard.txt'
						,error:function(xhr){ if( xhr.status===401 ) LoginDialog({ ok:start }); }
						,success:success
					});
				};
				var success = function(data){
					var pnode = tree.node( panel.id );
					var $itembox = $(panel).find('.itembox');
					var lines = data.split(/[\r\n]+/);							// 行分割
					var index = lines.length -1;								// 最後の行からはじめ
					var url = '';
					var ajaxs = [];												// ajax配列
					var complete = 0;											// 完了数カウント
					var itemAdd = function( url ,title ){
						// ノード作成
						var node = tree.newURL( pnode, url, title || url.noProto() );
						if( node ){
							// タイトル/favicon取得
							ajaxs.push($.ajax({
								type:'post'
								,url:':analyze'
								,data:url+'\r\n'
								,success:function(data){
									data = data[0];
									if( !title && data.title.length ){
										data.title = HTMLdec( data.title );
										if( tree.nodeAttr( node.id, 'title', data.title ) >1 )
											$('#'+node.id).attr('title',data.title).find('span').text(data.title);
									}
									if( data.icon.length ){
										if( tree.nodeAttr( node.id, 'icon', data.icon ) >1 )
											$('#'+node.id).find('img').attr('src',data.icon);
									}
								}
								,complete:function(){ complete++; }
							}));
							// DOM増加
							$newItem(node).prependTo( $itembox );
						}
					};
					tree.modifing(true);										// 編集中表示
					(function callee(){
						var count = 10;											// 10行ずつ
						while( index >=0 && count>0 ){
							var str = lines[index].replace(/^\s+|\s+$/g,'');	// 前後の空白削除(trim()はIE8ダメ)
							if( /^[A-Za-z]+:\/\/.+/.test(str) ){				// URL発見
								if( url ) itemAdd( url );
								url = str;
							}
							else if( url ) itemAdd( url ,str ) ,url='';			// タイトル付URL発見
							index--; count--;
						}
						// 次
						if( index >=0 ) setTimeout(callee,0);
						else{
							if( url ) itemAdd( url );
							// ajax完了待ち
							(function completed(){
								if( complete < ajaxs.length ) setTimeout(completed,250);
								else tree.modifing(false);						// 編集完了
							})();
						}
					})();
				};
				start();
			}));
		}
		$box.append($('<a><img src=pen.png>パネル編集（パネル名・アイテム編集）</a>').click(function(){
			$menu.hide();
			panelEdit( panel.id );
		}))
		.append($('<a><img src=txt.png>アイテムをテキストで取得</a>').click(function(){
			$menu.hide();
			var text = [];
			var child = tree.node( panel.id ).child;
			for( var i=0, n=child.length; i<n; i++ ){
				if( child[i].child ) continue;
				text.push( child[i].title + '\r' + child[i].url + '\r' );
			}
			// CSSのheight:100%;でダイアログリサイズするとタイトルバーが２行になった時に
			// 表示が崩れてしまい回避策がわからないので、リサイズイベントで高さ調節する。
			// マウスを速く動かすと、このresizeイベントはきっちり発火されるのにダイアログ
			// の大きさは途中までしか追従しないという、なんだか矛盾した挙動になるため、
			// setTimeoutで回避。マウスが止まってから少し遅れて高さ方向が調節される感じで
			// 表示の追従性が悪いのが難点。CSSのwidth:100%;は表示崩れもなく追従性もよいので、
			// できればCSSで高さ調節もしたいが…。
			var resize = function(){
				var timer = null;
				return function(){ clearTimeout( timer ); timer = setTimeout( resizer ,20 ); };
			}();
			var $box = $('#editbox').empty();
			$box.append( $('<textarea></textarea>').text(text.join('')) );
			$box.dialog({
				title	:'アイテムをテキストで取得'
				,modal	:true
				,width	:720
				,height	:480
				,close	:function(){ $(this).dialog('destroy'); }
				,resize	:resize
			});
			var $area = $box.find('textarea');
			function resizer(){
				var $p = $box.parent();
				// $box.prev()はダイアログタイトルバー(<div class="ui-dialog-titlebar">)
				$area.height( $p.height() - $box.prev().outerHeight() - 40 );
			}
			resizer();
		}))
		.append('<hr>')
		.append($('<a><img src=newwindow.png>全アイテムを新しいタブで開く</a>').click(function(){
			$menu.hide();
			$(panel).find('.itembox > a').each(function(){ window.open(this.href); });
		}))
		.append('<hr>')
		.append($('<a><img src=newfolder.png>ここに新規パネル作成</a>').click(function(){
			$menu.hide();
			// TODO:入力ダイアログは視線移動/マウス移動が多いから使わないUIの方がよいとは思うが
			// パネルの場所をそのままで編集できるUIが必要かな・・それはなかなか難しい。
			InputDialog({
				title:'新規パネル作成'
				,text:'パネル名',val:'新規パネル'
				,ok:function( name ){
					var node = tree.newFolder( name ||'新規パネル' );
					var $p = $newPanel( node );
					$(panel).before( $p );
					option.panel.layouted();
					columnHeightAdjust();
				}
			});
		}));
		// TODO:全パネルを閉じる、全パネルを開く
		if( tree.movable( panel.id ) ){
			$box.append('<hr>')
			.append($('<a><img src=delete.png>このパネルを削除（ごみ箱）</a>').click(function(){
				$menu.hide();
				tree.moveChild( [panel.id], tree.trash() );
				$(panel).remove();
				option.panel.layouted();
				columnHeightAdjust();
			}));
		}
		// メニュー表示
		$menu.width(280).css({
			left: (($win.width() -ev.clientX) <$menu.width())? ev.pageX -$menu.width() : ev.pageX
			,top: (($win.height() -ev.clientY) <$menu.height())? ev.pageY -$menu.height() : ev.pageY
		})
		.show();
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
		option.autoshot( $('#autoshot').prop('checked') );
	});
	// パネル設定ダイアログ
	$('#optionico').click(function(){
		// ページタイトル
		$('#pageTitle').val( option.page.title() )
		.off().on('input keyup paste',function(){
			if( this.value != option.page.title() ){
				option.page.title( this.value );
				document.title = option.page.title();
			}
		});
		// 色テーマ
		$('input[name=colorcss]').each(function(){
			if( this.value==option.color.css() ) $(this).prop('checked',true);
		})
		.off().change(function(){
			option.color.css( this.value );
			$('#colorcss').attr('href',option.color.css());
		});
		// 全体
		$('input[name=wallMargin]').each(function(){
			if( this.value==option.wall.margin() ) $(this).prop('checked',true);
		})
		.off().change(function(){
			option.wall.margin( this.value );
			$wall.css('margin',option.wall.margin());
		});
		// パネル幅
		$('#panelWidth').val( option.panel.width() )
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
				$('#panelWidth').val( val );
			}
		})
		.next().off().click(function(){
			var val = option.panel.width();
			if( val >100 ){
				option.panel.width( --val );
				optionApply();
				$('#panelWidth').val( val );
			}
		});
		// パネル余白
		$('#panelMarginV').val( option.panel.margin.top() )
		.off().on('input keyup paste',function(){
			if( !/^\d{1,3}$/.test(this.value) || this.value <0 || this.value >100 ) return;
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
				$('#panelMarginV').val( val );
			}
		})
		.next().off().click(function(){
			var val = option.panel.margin.top();
			if( val >0 ){
				option.panel.margin.top( --val );
				optionApply();
				$('#panelMarginV').val( val );
			}
		});
		$('#panelMarginH').val( option.panel.margin.left() )
		.off().on('input keyup paste',function(){
			if( !/^\d{1,3}$/.test(this.value) || this.value <0 || this.value >100 ) return;
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
				$('#panelMarginH').val( val );
			}
		})
		.next().off().click(function(){
			var val = option.panel.margin.left();
			if( val >0 ){
				option.panel.margin.left( --val );
				optionApply();
				$('#panelMarginH').val( val );
			}
		});
		// 列数
		$('#columnCount').val( option.column.count() )
		.off().on('input keyup paste',function(){
			if( !/^\d{1,2}$/.test(this.value) || this.value <1 || this.value >30 ) return;
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
				$('#columnCount').val( val );
			}
		})
		.next().off().click(function(){
			var val = option.column.count();
			if( val >1 ){
				columnCountChange( { prev:val, next:val-1 } );
				option.column.count( --val );
				optionApply();
				$('#columnCount').val( val );
			}
		});
		// アイコン拡大
		$('#iconSize').val( option.icon.size() )
		.next().off().click(function(){
			var val = option.icon.size();
			if( val <24 ){
				option.icon.size( ++val );
				optionApply();
				$('#iconSize').val( val );
			}
		})
		.next().off().click(function(){
			var val = option.icon.size();
			if( val >0 ){
				option.icon.size( --val );
				optionApply();
				$('#iconSize').val( val );
			}
		});
		// フォントサイズ
		$('#fontSize').val( option.font.size() )
		.next().off().click(function(){
			var val = option.font.size();
			if( val <24 ){
				option.font.size( ++val );
				optionApply();
				$('#fontSize').val( val );
			}
		})
		.next().off().click(function(){
			var val = option.font.size();
			if( val >9 ){
				option.font.size( --val );
				optionApply();
				$('#fontSize').val( val );
			}
		});
		// フォント - フォント種類ぶんのCSSファイルを切り替える方式。
		// CSSルール書き換えはブラウザ互換が心配＋面倒な感じするので却下。
		// http://pointofviewpoint.air-nifty.com/blog/2012/11/jquerycss-7530.html
		// http://d.hatena.ne.jp/ofk/20090716/1247719727
		$('input[name=fontcss]').each(function(){
			if( this.value==option.font.css() ) $(this).prop('checked',true);
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
					option.panel.width(-1).panel.margin.top(-1).panel.margin.left(-1);
					option.font.size(-1).icon.size(-1).column.count(-1);
					$('#panelWidth').val( option.panel.width() );
					$('#panelMarginV').val( option.panel.margin.top() );
					$('#panelMarginH').val( option.panel.margin.left() );
					$('#columnCount').val( option.column.count() );
					$('#iconSize').val( option.icon.size() );
					$('#fontSize').val( option.font.size() );
					optionApply();
				}
				,'パネル配置クリア':function(){
					option.panel.layout({});
					panelReady(); paneler( tree.top() );
				}
			}
		});
	});
	// ブックマークの整理
	$('#filerico').click(function(){
		$('#findstop').click();
		if( tree.modified() || option.modified() ) Confirm({
			width:380
			,msg:'変更が保存されていません。いま保存して次に進みますか？　「いいえ」で変更を破棄して次に進みます。'
			,yes:function(){ modifySave({ success:gotoFiler }); }
			,no	:gotoFiler
		});
		else gotoFiler();
		function gotoFiler(){ location.href = 'filer.html'; }
	});
	// ログアウト
	if( /session=.+/.test(document.cookie) ){
		$('#logout').click(function(){
			$('#findstop').click();
			if( tree.modified() || option.modified() ) Confirm({
				width:380
				,msg:'変更が保存されていません。いま保存してログアウトしますか？　「いいえ」で変更を破棄してログアウトします。'
				,yes:function(){ modifySave({ success:logout }); }
				,no	:logout
			});
			else logout();
			function logout(){
				$.ajax({
					url:':logout'
					,error:function(xhr){ Alert('エラー:'+xhr.status+' '+xhr.statusText); }
					,success:function(data){
						// dataはセッションID:過去日付でクッキー削除
						document.cookie = 'session='+data+'; expires=Thu, 01-Jan-1970 00:00:01 GMT';
						location.reload(true);
					}
				});
			}
		});
	}
	else{ $('#logout').hide(); sidebarHeight -=34; }
	// インポート・エクスポート
	$('#impexpico').click(function(){
		// ダイアログ表示
		$('#impexp').dialog({
			title	:'HTMLインポート・エクスポート'
			,modal	:true
			,width	:460
			,height	:330
			,close	:function(){ $(this).dialog('destroy'); }
		});
	});
	// HTMLインポート
	// NETSCAPE-Bookmark-file-1をパースしてJSONに変換する処理を、JavaScriptで書くかCで書くか。
	// JavaScriptのが楽かな。…と思ったら、<input type=file>のファイルデータをJavaScriptで取得
	// できないのか。HTML5のFileAPIでできるようになったと…。なんだじゃあサーバに一旦アップする
	// しかないか。そしてサーバ側でJSONに変換するか、無加工で取得してクライアント側で変換するか？
	// HTMLのパースをCで書くかJavaScriptで書くか…。どっちも手間そうだから動作軽そうなCにしよう。
	// 画面遷移せずにアップロードできるというトリッキーな方法。
	// [Ajax的に画像などのファイルをアップロードする方法]
	// http://havelog.ayumusato.com/develop/javascript/e171-ajax-file-upload.html
	// [画面遷移なしでファイルアップロードする方法 と Safariの注意点]
	// http://groundwalker.com/blog/2007/02/file_uploader_and_safari.html
	// TODO:Firefoxはインポートしたブックマークタイトルで&#39;がそのまま表示されてしまう…
	// TODO:FirefoxダイレクトインポートとHTML経由インポートとでツリー構造が異なる。
	// 独自ダイレクトインポートのJSONを、Firefoxが生成するHTMLにあわせればよいのだが…。
	$('#import').button().click(function(){
		var $impexp = $('#impexp');
		if( $impexp.find('input').val().length ){
			$impexp.find('form').off().submit(function(){
				$impexp.find('iframe').off().one('load',function(){
					var jsonText = $(this).contents().text();
					if( jsonText.length ){
						$('#dialog').dialog('destroy');
						try{
							// HTML文字参照(&lt;等)デコード
							var nodeTop = $.parseJSON(jsonText);
							(function decord1( node ){
								if( node.title ) node.title = HTMLdec(node.title);
								if( node.child ) for( var i=node.child.length; i--; ) decord1( node.child[i] );
							}( nodeTop ));
							analyzer( nodeTop );
						}
						catch(e){ Alert(e); }
					}
					$(this).empty();
					$impexp.dialog('destroy');
				});
				MsgBox('処理中です...');
			}).submit();
		}
	});
	// HTMLエクスポート
	// クライアント側でHTML生成するか、サーバ側でHTML生成するか悩む。
	// クライアント側で生成する場合、それを単純にダウンロードできればよいが、
	// HTML5のFileAPIを使う必要がありそう。こんな↓トリッキーな方法もあるようだが、
	//   [JavaScriptでテキストファイルを生成してダウンロードさせる]
	//   http://piro.sakura.ne.jp/latest/blosxom.cgi/webtech/javascript/2005-10-05_download.htm
	// トリッキーなだけに動いたり動かなかったりといった懸念がある。
	//   http://productforums.google.com/forum/#!topic/chrome-ja/q5QdYQVZctM
	// そうするとやはり一旦サーバ側にアップロードして、それをダウンロードするのが適切？
	// サーバ側ではファイル保存ではなくメモリ保持もありうるが…、実装が面倒くさいのでファイル保存。
	// エクスポートボタン押下でサーバに PUT bookmarks.html 後、GET bookmarks.html に移動する。
	// この場合、クライアント側で保持しているノードツリーがHTML化される。つまりまだ保存していない
	// データならそれがHTML化される。
	// サーバ側でHTML生成する場合は、ブラウザが持ってる未保存データは無視して保存済みtree.json
	// をHTML化することになる。CでJSONパースコードを書くか、適当なライブラリを導入してパースする。
	// これは単にサーバ側で /bookmarks.html のリクエストに対応してリアルタイムにJSON→HTML変換して
	// 応答を返せばいいので、サーバ側で無駄にファイル作ることもない。その方が単純かなぁ？
	// どっちでもいい気がするが、とりあえず実装が楽な方、クライアント側でのHTML生成にしてみよう。
	$('#export').button().click(function(){
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
				var add_date = ' ADD_DATE="'+ parseInt( (node.dateAdded||0) /1000 ) +'"';
				if( node.child ){
					// フォルダ
					html += indent +'<DT><H3'+ add_date +'>'+ HTMLenc(node.title||'') +'</H3>\n';
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
					var href = ' HREF="'+ URLesc(node.url||'') +'"';
					var icon_uri = ' ICON_URI="'+ URLesc(node.icon||'') +'"';
					html += indent +'<DT><A'+ href + add_date + icon_uri +'>'+ HTMLenc(node.title||'') +'</A>\n';
				}
			}
		}( tree.top().child, 1 ));
		html += '</DL><p>\n';
		// アップロード＆ダウンロード
		var start = function(){
			$.ajax({
				type:'put'
				,url:'export.html'
				,data:html
				,error:function(xhr){
					if( xhr.status===401 ) LoginDialog({ ok:start ,cancel:giveup });
					else giveup();

					function giveup(){ Alert('データ保存できません:'+xhr.status+' '+xhr.statusText); }
				}
				,success:function(){ location.href = 'export.html'; }
			});
		};
		start();
	});
	// スナップショット
	$('#snapico').click(function(){
		// 一覧取得表示
		var $shots = $('#shots');
		var start = function(){
			$shots.text('...取得中...');
			$.ajax({
				url:':shotlist'
				,error:function(xhr){
					$shots.empty();
					if( xhr.status===401 ) LoginDialog({ ok:start ,cancel:giveup });
					else giveup();

					function giveup(){
						Alert('作成済みスナップショット一覧を取得できません:'+xhr.status+' '+xhr.statusText);
					}
				}
				,success:function(data){ shotlist( data ); }
			});
		};
		start();
		// ダイアログ表示
		$('#snap').dialog({
			title	:'スナップショット'
			,modal	:true
			,width	:540
			,height	:420
			,close	:function(){
				// メモを保存
				$shots.find('div').each(function(){
					if( $(this).hasClass('select') ){ $(this).find('.memo').blur(); return false; }
				});
				$(this).dialog('destroy');
			}
		});
	});
	// スナップショット作成
	$('#shot a').button().click(function(){
		var $btn = $(this).hide();	// ボタン隠して
		$btn.next().show();			// 処理中画像(wait.gif)表示
		// メモを編集した状態からいきなり作成ボタンを押すと、inputのblurイベント(メモ保存ajax)
		// とこのクリックイベントのajaxが同時発生する。ブラウザではblurの方が先のようだが、
		// サーバ側で逆転する場合があるのか、メモ保存前にsnapshotが実行されてしまい、メモが
		// まだない状態の一覧が表示されて、メモが消えたような感じになる。再表示すればメモは
		// 保存されているが、問題だ。どうしよう…setTimeoutでいいかな？サーバ側での実行順序
		// を保証できるわけではないが、とりあえず…。
		setTimeout(function(){
			function snapshot(){
				$.ajax({
					url:':snapshot'
					,error:function(xhr){
						if( xhr.status===401 ) LoginDialog({ ok:snapshot ,cancel:giveup });
						else giveup();

						function giveup(){
							Alert('作成できません:'+xhr.status+' '+xhr.statusText);
							$btn.next().hide();
							$btn.show();
						}
					}
					,success:function(data){
						shotlist( data );
						$btn.next().hide();
						$btn.show();
					}
				});
			}
			snapshot();
		},100);
	});
	// スナップショット復元
	$('#shotview').button().click(function(){
		var $btn = $(this);
		var item = null;
		$('#shots').find('div').each(function(){
			if( $(this).hasClass('select') ){ item=this; return false; }
		});
		if( item ){
			if( !tree.modified() && !option.modified() ) shotView();
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
			function shotget(){
				$.ajax({
					url:':shotget?'+item.id
					,error:function(xhr){
						if( xhr.status===401 ) LoginDialog({ ok:shotget ,cancel:giveup });
						else giveup();

						function giveup(){
							Alert('データ取得できません:'+xhr.status+' '+xhr.statusText);
							$btn.next().hide();
							$btn.show();
						}
					}
					,success:function(data){
						if( 'index.json' in data ) option.merge( data['index.json'] );
						else option.clear();
						if( 'filer.json' in data ) option_filer = data['filer.json'];
						panelReady(); paneler( tree.replace(data['tree.json']).top() );
						$btn.next().hide();
						$btn.show();
					}
				});
			}
			shotget();
		}
	});
	// スナップショット消去
	// TODO:削除後に次エントリか前エントリを選択状態にする
	$('#shotdel').button().click(function(){
		var $btn = $(this);
		var item = null;
		$('#shots').find('div').each(function(){
			if( $(this).hasClass('select') ){ item=this; return false; }
		});
		if( item ){
			Confirm({
				msg:$(item).find('.date').text()+'　のスナップショットを#BR#ディスクから完全に消去します。'
				,ok:function(){
					$btn.hide().next().show();	// ボタン隠して処理中画像(wait.gif)表示
					function shotdel(){
						$.ajax({
							url:':shotdel?'+item.id
							,error:function(xhr){
								if( xhr.status===401 ) LoginDialog({ ok:shotdel ,cancel:giveup });
								else giveup();

								function giveup(){
									Alert('消去できません:'+xhr.status+' '+xhr.statusText);
									$btn.next().hide();
									$btn.show();
								}
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
					shotdel();
				}
			});
		}
	});
	// スナップショット一覧(再)表示
	// パネル生成と同様$.clone()で高速化できるけど…そんな遅くないしまあいいか…
	function shotlist( list ){
		var $shots = $('#shots').empty();
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
							type:text.length? 'put':'del'
							,url:'snap/'+id.replace(/cab$/,'txt')
							,error:function(xhr){
								if( xhr.status===401 ) LoginDialog({ ok:update ,cancel:giveup });
								else giveup();

								function giveup(){
									Alert('メモを保存できません:'+xhr.status+' '+xhr.statusText);
								}
							}
							,success:function(){ item.memo=text; widthAdjust(); }
						};
						if( text.length ) opt.data = text;
						var update = function(){ $.ajax(opt); };
						update();
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
		// 一欄の横幅を計算してセットする。<span>を使って文字列描画幅を算出。
		// http://qiita.com/items/1b3802db80eadf864633
		(function widthAdjust(){
			// メモ欄の文字列横幅最大を算出
			var maxWidth = 0;
			var $span = $('<span></span>').css({
					position		:'absolute'
					,visibility		:'hidden'
					,'white-space'	:'nowrap'
					,'font-weight'	:'bold'
				}).appendTo(document.body);
			for( var i=list.length; i--; ){
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
		})();
	}
	// 検索
	// TODO:検索ボックスの状態(表示ON/OFF・高さ)を保持すると便利？
	$('#foundbox').height( $win.height() /3 );
	$('#finding').progressbar().mousedown(function(ev){
		// プログレスバーをD&Dで検索領域高さ変更
		$(this).addClass('drag');
		var foundHeight = $('#foundbox').height();
		var downY = ev.clientY;
		$doc.on('mousemove.findbox',function(ev){
			var h = foundHeight +(downY - ev.clientY);
			$('#foundbox').height( (h<1)? 1:h );
			$win.trigger('resize.findbox');
		})
		.one('mouseup',function(){
			$doc.off('mousemove.findbox mouseleave.findbox');
			$('#finding').removeClass('drag');
			columnHeightAdjust();
		});
		if( IE && IE<9 ) $doc.on('mouseleave.findbox',function(){ $doc.mouseup(); });
	});
	$('#findtab').find('button').button().end()
	.find('input').keypress(function(ev){
		// Enterで検索実行
		switch( ev.which || ev.keyCode || ev.charCode ){
		case 13: $('#findstart').click(); return false;
		}
	});
	$('#findico').click(function(){
		// 検索対象パネル(フォルダ)配列生成・URL総数カウント
		// パネル1,334+URL13,803でIE8でも15ms程度で完了するけっこう速い
		var findTarget = function(){
			var root = null;	// ツリー更新判定用tree.root保持
			var nextid = 0;		// ツリー更新判定用tree.root.nextid保持
			var panels = [];	// パネル(フォルダ)ノード配列
			var total = 0;		// ノード(URL＋パネル)数
			return function(){
				function panelist( node ){
					panels.push( node );
					total += node.child.length;
					for( var i=0, n=node.child.length; i<n; i++ ){
						if( node.child[i].child ) panelist( node.child[i] );
					}
				}
				if( !(root===tree.root && nextid==tree.root.nextid) ){
					// (検索結果に影響する)ツリー更新あった時だけ生成
					// この判定だとノードがなくなった事を検知できないが、基本画面は
					// ノード削除できないのでノードなくなる事はない。毎回生成しても
					// 体感速度はそれほど悪化はしないけど…
					root = tree.root;
					nextid = tree.root.nextid;
					panels = [];
					total = 0;
					panelist( tree.top() ); total++;
					panelist( tree.trash() ); total++;
				}
				return { panels:panels ,total:total };
			};
		}();
		return function(){
			var $box = $('#findbox');
			var $tab = $('#findtab');
			if( $tab.css('display')!='none' ){
				// 表示されていたら隠す
				$('#findhide').click();
				$('#findico').blur();
				return;
			}
			var $found = $('#foundbox');
			var $url = $('<a class=item target="_blank"><img class=icon><span></span></a>');
			var $pnl = $('<div><img src=folder.png class=icon><span></span></div>');
			function foundBoxInit(){
				// フォントサイズ・アイコンサイズ・アイテム横幅(460px以上)
				var fontSize = option.font.size();
				var iconSize = option.font.size() + 3 +option.icon.size();
				var width = $found.width() -17;
				var count = width /460 |0;
				width = width /(count?count:1) -4 |0;
				$url.width(width).find('img').width(iconSize).height(iconSize);
				$pnl.width(width).find('img').width(iconSize).height(iconSize);
				$found.empty().css('font-size',fontSize);
			}
			function foundUrl( node ){
				$found.append(
					$url.clone()
					.attr({ id:'fd'+node.id, href:node.url, title:node.title })
					.find('img').attr('src',node.icon ||'item.png').end()
					.find('span').text(node.title).end()
				);
			}
			function foundPanel( node ){
				$found.append(
					$pnl.clone().find('span').text(node.title).end()
				);
			}
			$('#findhide').off('click').click(function(){
				// 閉じる
				$url.remove();
				$pnl.remove();
				$('#findstart,#new100,#old100').off('click');
				$('#findstop').click().off('click');
				var h = $('#findtab').height() +$('#findbox').height();
				$wall.children('.column').each(function(){
					this.style.paddingBottom = parseInt(this.style.paddingBottom) - h +'px';
				});
				$('#findtab,#findbox').hide();
				$win.off('resize.findbox');
			});
			$win.on('resize.findbox',function(){
				// TODO:設定でパネル幅を変更してウィンドウ横スクロールバーが出たり消えたりするのに追従できない
				var h = $win.height() - $box.outerHeight();
				$box.css('top', h ).width( $win.width() -5 );	// -5px適当微調整
				$tab.css('top', h -$tab.outerHeight() +1 );		// +1px下にずらして枠線を消す
			})
			.trigger('resize.findbox');
			$box.show();
			$tab.show().find('input').focus();
			$wall.children('.column').each(function(){
				this.style.paddingBottom = parseInt(this.style.paddingBottom) +$box.height() +$tab.height() +'px';
			});
			// キーワード検索
			var timer = null;
			$('#findstart').click(function(){
				clearTimeout( timer );
				// 検索ワード
				var words = $tab.find('input').val().split(/[ 　]+/); // 空白文字で分割
				for( var i=words.length; i--; ){
					if( words[i].length<=0 ) words.splice(i,1);
					else words[i] = words[i].myNormal();
				}
				if( words.length<=0 ) return;
				String.prototype.myFound = function(){
					// AND検索(TODO:OR検索・大小文字区別対応する？)
					for( var i=words.length; i--; ){
						if( this.indexOf(words[i])<0 ) return false;
					}
					return true;
				};
				// 検索中表示・準備
				// wait.gifは黒背景で見た目が汚いので使えない…
				var $pgbar = $('#finding').progressbar('value',0);
				foundBoxInit();
				$(this).hide();
				$('#findstop').click(function(){
					clearTimeout( timer );
					$(this).hide();
					$('#findstart').show();
					$pgbar.progressbar('value',0);
				}).show();
				// 検索実行
				var target = findTarget();
				var index = 0;
				var total = 0;
				(function callee(){
					var limit = total +21; // 20ノード以上ずつ
					while( index < target.panels.length && total<limit ){
						var panel = target.panels[index];
						// パネル名
						if( panel.title.myNormal().myFound() ) foundPanel( panel );
						total++;
						// ブックマークタイトルとURL
						var child = panel.child;
						for( var i=0, n=child.length; i<n; i++ ){
							if( child[i].child ) continue;
							if( (child[i].title +child[i].url).myNormal().myFound() ) foundUrl( child[i] );
							total++;
						}
						index++;
					}
					// 進捗バー
					$pgbar.progressbar('value',total*100/target.total);
					// 次
					if( index < target.panels.length ) timer = setTimeout(callee,0);
					else{
						$('#findstop').click();
						if( $found[0].children.length<=0 ) $found.text('見つかりません');
					}
				})();
			});
			// 新旧100
			function sortUrlTop( max ,fromRecent ){
				var target = findTarget();
				var urls = [];
				for( var i=target.panels.length; i--; ){
					var child = target.panels[i].child;
					for( var j=child.length; j--; ){
						var node = child[j];
						if( node.child ) continue;
						var date = node.dateAdded ||0;
						for( var k=urls.length; k--; ){
							if( fromRecent ){
								if( (urls[k].dateAdded||0) >=date ) break;
							}
							else{
								if( (urls[k].dateAdded||0) <=date ) break;
							}
						}
						if( ++k < max ){
							urls.splice( k ,0 ,node );
							if( urls.length >= max ) urls.length = max;
						}
					}
				}
				foundBoxInit();
				for( var i=0 ,n=urls.length; i<n; i++ ) foundUrl( urls[i] );
			}
			$('#new100').click(function(){ sortUrlTop( 100 ,true ); });
			$('#old100').click(function(){ sortUrlTop( 100 ); });
		};
	}());
	// ドラッグドロップ並べ替えイベント
	columnSortable()
	panelSortable();
	itemSortable();
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
		// TABによるフォーカス移動中はサイドバーを出したり引っ込めたりしたいが、マウスで
		// ボタンクリック後やカーソルがサイドバー上にある場合は引っ込めないようにしたい。
		// TODO:TABでサイドバー出した後マウスでボタンクリックすると引っ込んでしまう。
		// TABだけで操作あるいはマウスだけで操作なら問題ないが…
		,focus:function(){
			// フォーカス来たらサイドバー出す
			if( !$sidebar.hasClass('show') ){
				$doc.trigger('mousemove.sidebar',['show']);
				// フォーカス消えたら収納
				$(this).one('blur',function(){ $doc.trigger('mousemove.sidebar',['hide']); });
			}
		}
	});
	// テキスト選択キャンセル
	$doc.on('selectstart',function(ev){
		switch( ev.target.tagName ){
		case 'INPUT': case 'TEXTAREA': return true;
		}
		return false;
	});
	// WebBookmarkエクスポート
	$('#webbookmark').each(function(){
		var BASE_URL = 'https://webbookmark.info';
		var $dialog = $(this);
		// 実行
		$dialog.find('.export').click(function(ev){
			if( tree.modified() || option.modified() ) Confirm({
				width:380
				,msg:'変更が保存されていません。いま保存して次に進みますか？　「いいえ」で変更を破棄して次に進みます。'
				,yes:function(){ modifySave({ success:authorize }); }
				,no	:authorize
			});
			else authorize();
		});
		// 認可
		function authorize(){
			var query = {
				url: location.protocol +'//'+ location.host + location.pathname + '?callback=webbookmark' + location.hash,
			};
			location.href = BASE_URL + '/user/authorize/jcbookmark?' + $.param(query);
		}
		// WebBookmarkから戻ってきた時(2)
		function callbacked(){
			var key = 'webbookmark_auth_code';
			if( !localStorage.hasOwnProperty(key) ) return;
			var code = localStorage.getItem(key);
			localStorage.removeItem(key);
			$('#webbookmarkico').click();
			if( code ){
				doExport(code);
				return;
			}
			$dialog.addClass('error').find('.error h4 small').text('no code');
		}
		// エクスポート実行
		function doExport( auth_code ){
			// filer.json取得してデータ送信
			$dialog.addClass('progress');
			var option_filer = null;
			$.ajax({
				url:'filer.json'
				,success: function( data ){ option_filer = data; }
				,complete: main
			});
			function main(){
				$.ajax({
					type:'post'
					,url: BASE_URL + '/api/user/book/import_jcbookmark'
					,xhrFields: {
						withCredentials: true
					}
					,headers:{
						'X-Auth-Code': auth_code
					}
					,contentType: 'application/json'
					,data: JSON.stringify({
						tree: tree.root
						,panel: option.data
						,filer: option_filer
					})
					,success: ok
					,error: error
				});
			}
			function ok( data ){
				$dialog.removeClass('progress');
				if( data.error ){
					$dialog.addClass('error').find('.error h4 small').text(data.error);
				}
				if( data.success ) $dialog.addClass('ok');
			}
			function error( xhr ){
				$dialog.removeClass('progress');
				$dialog.addClass('error').find('.error h4 small').text(xhr.status +' '+ xhr.statusText);
			}
		}
		// ダイアログ
		$('#webbookmarkico').click(function(){
			$dialog.dialog({
				title	:'WebBookmarkエクスポート'
				,modal	:true
				,width	:600
				,height	:430
				,close	:function(){ $(this).dialog('destroy'); }
			});
		});
		setTimeout(callbacked,0);
	});
}
// WebBookmarkから戻ってきた時(1)
function WebBookmarkCallback(){
	var key = 'webbookmark_auth_code';
	var query = parseQueryString(location.search);
	if( query.callback !== 'webbookmark' ) return;
	localStorage.setItem(key, query.code || '');
	delete query.callback;
	delete query.code;
	location.href = location.protocol +'//'+ location.host + location.pathname +'?'+ $.param(query) + location.hash;
}
function parseQueryString( qs ){
	if( qs[0] === '?' ) qs = qs.slice(1);
	var array = qs.split('&');
	var query = {};
	for( var i=array.length; i--; ){
		var p = array[i].split('=');
		var name = decodeURIComponent(p[0]);
		if( name ) query[name] = decodeURIComponent(p[1]);
	}
	return query;
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
		if( panel===false ){
			// ポップアップ解除
			clearTimeout( itemTimer );
			$doc.off('mousemove.itempop');
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
			if( left + panel.offsetWidth > $win.scrollLeft() + $win.width() )
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
			var bottomLine = $win.scrollTop() + $win.height();
			var boxTopLimit = $win.scrollTop();
			var boxTop = $box.offset().top;
			if( tree.modified() || option.modified() ) boxTopLimit += $('#modified').outerHeight();
			if( boxTopLimit > boxTop ) boxTopLimit = boxTop;
			// 検索ボックスに被らないように上に
			if( $('#findbox').css('display')!='none' ){
				bottomLine -= $('#findbox').outerHeight();
				if( $box[0].offsetLeft -$win.scrollLeft() < $('#findtab').outerWidth() )
					bottomLine -= $('#findtab').outerHeight();
			}
			// パネル下段より上にいかないように
			if( bottomLine < panel.offsetTop + $(panel).outerHeight() )
				bottomLine = panel.offsetTop + $(panel).outerHeight();
			(function callee(){
				var count = 10;
				while( index < length && count>0 ){
					if( !child[index].child ) $box.append( $newItem( child[index] ) );
					index++; count--;
				}
				// 下に隠れる場合は上に移動
				var hidden = boxTop + $box.outerHeight() - bottomLine;
				if( hidden >0 ){
					var newTop = boxTop - hidden;
					if( newTop < boxTopLimit ) newTop = boxTopLimit;
					if( newTop != boxTop ){
						$box.css('top', newTop );
						boxTop = newTop;
					}
				}
				// 次
				if( index < length ) itemTimer = setTimeout(callee,0);
			})();
			// カーソル移動方向と停止時間を監視
			$doc.on('mousemove.itempop',function(ev){
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
						|| destY < box.offsetTop -32		// box範囲外方向(-32少し余裕)
						|| destY > box.offsetTop + box.offsetHeight	+32 // box範囲外方向(+32少し余裕)
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
			if( !child[i].child ) $box.append( $newItem( child[i] ) );
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
	columnHeightAdjust();
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
						var url = this.value;
						var $item = $('<a class=edit></a>').attr('title',url);
						var $icon = $('<img class=icon src=item.png>');
						var $edit = $('<input>').width( $itembox.width() -64 ).val( url.noProto() );
						var $idel = $('<img class=idel src=delete.png title="削除">');
						// URLタイトル、favicon取得
						var analyze = function(){
							$.ajax({
								type:'post'
								,url:':analyze'
								,data:url +'\r\n'
								,error:function(xhr){ if( xhr.status==401 ) LoginDialog({ ok:analyze }); }
								,success:function(data){
									data = data[0];
									if( data.title.length ) $edit.val( HTMLdec( data.title ) );
									if( data.icon.length ) $icon.attr('src',data.icon);
								}
							});
						};
						analyze();
						// 新規登録ボタンの次に挿入
						$commit.after( $item.append($idel).append($icon).append($edit) ).hide();
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
	$doc.on('click.paneledit','#editbox .idel',function(){
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
		var count = 5;
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
		if( index < length ) timer = setTimeout(callee,0); else iconSortable();
	})();
	// ファビコンD&Dでアイテム並べ替え
	function iconSortable(){
		$doc.on('mousedown.paneledit','#editbox div .icon',function(ev){
			var item = this.parentNode;
			var downX = ev.pageX;
			var downY = ev.pageY;
			var $dragi = null;
			var $place = null;
			var scroll = null;
			var scrollTop = $itembox.offset().top +30;
			var scrollBottom = scrollTop + $itembox.height() -60;
			var speed = 0;
			var $item = $(item).addClass('drag');	// ドラッグ中スタイル
			function dragStart(ev){
				// ある程度カーソル移動したらドラッグ開始
				if( (Math.abs(ev.pageX-downX) +Math.abs(ev.pageY-downY)) >20 ){
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
				}
			}
			$doc.on('mousemove.paneledit',function(ev){
				if( !$dragi ) dragStart(ev);
				if( $dragi ){
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
				}
			})
			.on('mousemove.paneledit','#editbox div .edit',function(ev){
				if( !$dragi ) dragStart(ev);
				if( $dragi ){
					// ドロップ場所移動
					var $this = $(this);
					if( ev.pageY < $this.offset().top + $this.height()/2 )
						$this.before( $place );
					else
						$this.after( $place );
				}
			})
			.one('mouseup',function(){
				clearInterval( scroll );
				$doc.off('mousemove.paneledit mouseleave.paneledit');
				if( $dragi ) $dragi.remove();
				if( $place ){
					$place.after( item );
					$place.remove();
				}
				$item.css('opacity','').removeClass('drag');
			});
			if( IE && IE<9 ){
				$doc.on('mouseleave.paneledit',function(){
					if( $place ) $place.remove(), $place=null;
					$doc.mouseup();
				});
				// TODO:IE8はなぜかエラー発生させればドラッグ可能になる　→dragstartイベント調査(A,IMGには既定のドラッグ挙動がある)
				xxxxx;
			}
			// Firefoxはreturn falseしないとテキスト選択になってしまう…
			else return false;
		});
	}
	// CSSで高さを調節したいが、ダイアログリサイズでタイトルバーが２行になった時に
	// 表示が崩れてしまい回避策がわからないので、リサイズイベントで高さ調節する。
	// マウスを速く動かすと、このresizeイベントはきっちり発火されるのにダイアログ
	// の大きさは途中までしか追従しないという、なんだか矛盾した挙動になるため、
	// setTimeoutで回避。マウスが止まってから少し遅れて高さ方向が調節される感じで
	// 表示の追従性が悪いのが難点。CSSなら追従性もよいのだが…。
	var resize = function(){
		var timer = null;
		return function(){ clearTimeout( timer ); timer = setTimeout( resizer ,20 ); };
	}();
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
				for( var i=idels.length; i--; ) $('#'+idels[i]).remove();
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
				columnHeightAdjust();
			}
			,'キャンセル':close
		}
		,resize:resize
	});
	function close(){
		clearTimeout(timer);
		$itembase.remove();
		$doc.off('click.paneledit mousedown.paneledit');
		$editbox.dialog('destroy');
	}
	function resizer(){
		// $editbox.prev()はダイアログタイトルバー(<div class="ui-dialog-titlebar">)
		var h = $editbox.parent().height() -$editbox.prev().outerHeight();
		$editbox.height( h -77 ).find('.edit input').width( $itembox.width() -64 );
		$itembox.height( h -99 );
	}
	resizer();
}
// 変更保存
function modifySave( arg ){
	// 順番に保存
	if( tree.modified() ){
		$('#modified').hide();
		$('#progress').show();
		tree.save({ success:optionSave, error:err });
	}
	else optionSave();

	function optionSave(){
		if( option.modified() ){
			$('#modified').hide();
			$('#progress').show();
			option.save({ success:suc, error:err });
		}
		else suc();
	}
	function suc(){
		$('#progress').hide();
		$wall.css('padding-top',0);

		if( option.autoshot() ) snapshot();
		else if( arg && arg.success ) arg.success();

		function snapshot(){
			$.ajax({
				url:':snapshot'
				,error:function(xhr){
					Alert('スナップショット作成できませんでした:'+xhr.status+' '+xhr.statusText);
				}
				,complete:function(){ if( arg && arg.success ) arg.success(); }
			});
		}
	}
	function err(){
		$('#progress').hide();
		$('#modified').show();
	}
}
// favicon解析してから移行データ取り込み
function analyzer( nodeTop ){
	var timer = null;		// タイマーID
	var total = 0;			// URL総数
	var rooms = [];			// ajax管理配列
	var roomMax = 5;		// ajax管理配列数(クライアント側並列ajax数)上限
	var queue = [];			// 解析待ちノード配列
	var qix = 0;			// ノード配列インデックス
	var complete = 0;		// 解析完了数
	var parallel = 1;		// 調節並列数(クライアント側ajax数×サーバー側並列数)
	var capacity = 50;		// 全体並列数上限(約)
	var faviconPool = {
		// 取得したfaviconを使いまわすためのプール
		// YouTubeに大量アクセスするとなぜかJCBookmark.exeが落ちるので導入
		// あとニュース系ポータル系などfaviconが１つ固定でパスがいっぱいあるサイトは同様
		// TODO:こういう機能はWebサイトに置いてAPI的に使うのがいいのかな…
		pool:{}
		,add:function( url ,favicon ){
			var host = url.hostName();
			switch( host ){
			/* YouTube */ case 'www.youtube.com': case 'jp.youtube.com':
			/* ポータル */ case 'headlines.yahoo.co.jp': case 'news.nifty.com': case 'news.goo.ne.jp':
			/* SNS */ case 'twitter.com':
			/* メディア */ case 'www3.nhk.or.jp': case 'www.yomiuri.co.jp': case 'www.asahi.com':
			case 'mainichi.jp': case 'www.jiji.com': case 'www.47news.jp':
			/* QAサイト */ case 'stackoverflow.com': case 'ja.stackoverflow.com':
			case 'www.atmarkit.co.jp': case 'qa.atmarkit.co.jp':
			/* ニュース系 */ case 'gihyo.jp': case 'www.itmedia.co.jp': case 'gigazine.net':
			case 'qiita.com': case 'matome.naver.jp':
				faviconPool.pool[host] = favicon;
			}
		}
		,get:function( url ){
			var host = url.hostName();
			if( host in faviconPool.pool ) return faviconPool.pool[host];
			return null;
		}
	};
	var ajaxCreate = function( nodeCount ){
		var entry = { nodes:[] } ,reqBody = '';
		for( var i=nodeCount; i && qix < queue.length; ){
			var node = queue[qix++];
			var favicon = faviconPool.get( node.url );
			if( favicon ){
				//console.log(node.url+'はプールのfavicon('+favicon+')を採用');
				node.icon = favicon;
				complete++;
			}
			else{
				entry.nodes.push( node );
				reqBody += ':'+ node.url +'\r\n';
				i--;
			}
		}
		if( reqBody ){
			//console.log('ajax発行、URL='+ entry.nodes.length);
			entry.$ajax = $.ajax({
				type:'post'
				,url:':analyze'
				,data:reqBody
				,success:function(data){
					// data.length==entry.nodes.length のはず…
					for( var i=entry.nodes.length; i--; ){
						if( data[i].icon.length ){
							entry.nodes[i].icon = data[i].icon;
							faviconPool.add( entry.nodes[i].url ,data[i].icon );
						}
					}
					paraAdjust( data );
				}
				,complete:function(){
					complete += entry.nodes.length;
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
	// 並列数を調節
	function paraAdjust( st ){
		var times = 0;			// 正常通信の数
		var timeAve = 0;		// 正常通信の平均時間
		var timeouts = 0;		// タイムアウト発生回数
		for( var i=st.length; i--; ){
			switch( st[i].kind ){
			case 'O': case 'D': case '!':	// 正常・死亡・注意(通信正常)
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
			if( !times || timeAve >1500 ){
				var para = Math.floor( parallel /2 );
				//console.log('並列数を半減'+ parallel +' -> '+ para);
				parallel = para;
				return;
			}
			//else console.log('正常通信の時間は短いため並列数は維持');
		}
		if( times ){
			//console.log('正常通信の平均時間'+ timeAve);
			var para = Math.floor( parallel * (1500.0 / timeAve) );	// 1.5秒で完了する数に近づける
			if( para <1 ) para=1; else if( para >capacity ) para = capacity;
			if( para != parallel ){
				//console.log('並列数を変更'+ parallel +' -> '+ para);
				parallel = para;
			}
		}
	}
	// 中断して次に進む
	function skip(){
		clearTimeout(timer) ,timer=null, ajaxCreate=null;
		if( rooms.length ){
			for( var i=rooms.length; i--; ) if( rooms[i].$ajax ) rooms[i].$ajax.abort();
			rooms = [];
		}
		queue.length = 0;
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
		,height	:220
		,close	:skip
		,buttons:{ 'スキップして次に進む':skip }
	});
	// ノード配列作成
	(function queuer( node ){
		if( node.child ){
			for( var i=0, n=node.child.length; i<n; i++ ) queuer( node.child[i] );
		}
		else{
			total++;
			if( node.url.length && !/^javascript:/i.test(node.url) && !node.icon.length )
				queue.push( node );
		}
	}( nodeTop ));
	// ajax開始
	ajaxStart();
	// 進捗表示
	$msg.text('ブックマーク'+total+'個のうち、'+queue.length+'個のファビコンがありません。ファビコンを取得しています...' );
	$count.text('(0/'+queue.length+')');
	$pgbar.progressbar('value',0);
	// 完了待ちループ
	(function waiter(){
		if( complete < queue.length ){
			$count.text('['+ complete +'/'+ queue.length +']');
			$pgbar.progressbar('value',complete*100/queue.length);
			timer = setTimeout(waiter,500);
			return;
		}
		// 完了
		$('#dialog').dialog('destroy');
		importer( nodeTop );
	})();
}
// 移行データ取り込み
function importer( nodeTop ){
	$('#dialog').html('現在のデータを破棄して、新しいデータに差し替えますか？<br>それとも追加登録しますか？')
	.dialog({
		title	:'データ取り込み方法の確認'
		,modal	:true
		,width	:430
		,height	:180
		,close	:function(){ $(this).dialog('destroy'); }
		,buttons:{
			'差し替える':function(){
				$(this).dialog('destroy');
				option.panel.layout({}).panel.status({});
				// ※font.cssのみ特殊index.jsonと常に同期(途中から導入のため)
				option_filer = {
					 font:{ css: option.font.css() }
				};
				panelReady(); paneler( tree.replace(nodeTop).top() );
			}
			,'追加登録する':function(){
				$(this).dialog('destroy');
				panelReady(); paneler( tree.mount(nodeTop.child[0]).top() );
			}
			,'キャンセル':function(){ $(this).dialog('destroy'); }
		}
	});
}
// ドラッグ中スクロール制御
var dragScroll = function(){
	var timer = null;
	return function( ev, event ){
		clearTimeout( timer );
		if( ev ){
			var dx=0, dy=0;
			if( ev.clientX <=40 ){
				dx = ev.clientX -40;
			}
			else if( ev.clientX >=$win.width() -40 ){
				dx = 40 -($win.width() -ev.clientX);
			}
			if( ev.clientY <=40 ){
				dy = ev.clientY -40;
			}
			else if( ev.clientY >=$win.height() -40 ){
				dy = 40 -($win.height() -ev.clientY);
			}
			if( dx || dy ){
				(function callee(){
					var oldLeft = $win.scrollLeft();
					var oldTop = $win.scrollTop();
					scrollTo( oldLeft + dx, oldTop + dy );
					dx = $win.scrollLeft() - oldLeft;
					dy = $win.scrollTop() - oldTop;
					if( dx || dy ) timer = setTimeout(callee,100);
					event( dx ,dy );
				})();
			}
			else event(0,0);
		}
	};
}();
// カラム並べ替え(列入れ替え)
function columnSortable(){
	$doc.on('mousedown','.column',function(ev){
		if( ev.target.id=='newurl' ) return;
		var element = this;
		var downX = ev.pageX;
		var downY = ev.pageY;
		var $dragi = null;				// ドラッグ物
		var $place = null;				// ドロップ場所
		var origin = {left:0,top:0};	// 元々の座標
		$(element).addClass('active');	// スタイル
		function dragStart(ev){
			// ある程度カーソル移動したらドラッグ開始
			if( (Math.abs(ev.pageX-downX) +Math.abs(ev.pageY-downY)) >20 ){
				// カーソルと共に移動する要素
				$dragi = $(element);
				origin = $dragi.offset();
				$dragi.css({ position:'absolute' ,top:origin.top });
				// ドロップ場所
				$place = $('<div class=columndrop></div>')
						.width( $dragi.outerWidth() )
						.height( $dragi.outerHeight() )
						.insertAfter( $dragi );
			}
		}
		$doc.on('mousemove.dragdrop','.column, .columndrop',function(ev){
			if( !$dragi ) dragStart(ev);
			if( $dragi ){
				// スクロール制御
				dragScroll(ev,function( dx ,dy ){
					ev.pageX += dx;
					// ドラッグ物
					$dragi.css({ left:origin.left +ev.pageX -downX });
					// ドロップ場所
					$wall.children('.column').each(function(){
						if( this==element ) return;
						var $this = $(this);
						if( $this.offset().left <= ev.pageX && ev.pageX <= $this.offset().left + this.offsetWidth ){
							if( $this.prev().hasClass('columndrop') ) $this.after( $place );
							else $this.before( $place );
							return false;
						}
					});
				});
			}
		})
		.one('mouseup',function(ev){
			// スクロール停止
			dragScroll(false);
			// イベント解除
			$doc.off('mousemove.dragdrop mouseleave.dragdrop');
			// ドロップ並べ替え終了
			if( $place ){
				if( $place.parent().attr('id')=='wall' ) $place.after( $dragi );
				$place.remove(); $place=null;
				$dragi.css('position',''); $dragi=null;
				// 要素ID付け直し
				$wall.children('.column').removeAttr('id').each(function(i){ $(this).attr('id','co'+i); });
				option.panel.layouted();
			}
			$(element).removeClass('active');	// スタイル解除
		})
		// 右クリックメニューが消えなくなったのでここで実行
		.trigger('mousedown');
		if( IE && IE<9 ){
			// see panelSortable()
			$doc.on('mouseleave.dragdrop',function(){
				if( $place ) $(element).after( $place );	// 元の場所で
				$doc.mouseup();								// ドロップ
			});
			// TODO:IE8はなぜかエラー発生させればドラッグ可能になる　→dragstartイベント調査(A,IMGには既定のドラッグ挙動がある)
			xxxxx;
		}
		// Firefoxはreturn falseしないとテキスト選択になってしまう…
		else return false;
	});
}
// パネル並べ替え
function panelSortable(){
	$doc.on('mousedown','.panel',function(ev){
		// 新規ブックマーク入力欄と登録ボタンは何もしない
		if( ev.target.id=='newurl' ) return;
		if( ev.target.id=='commit' ) return false;
		var element = this;
		var downX = ev.pageX;
		var downY = ev.pageY;
		var $dragi = null;				// ドラッグ物
		var $place = null;				// ドロップ場所
		$(element).addClass('active');	// スタイル(FirefoxでなぜかCSSの:activeが効かないので)
		function dragStart(ev){
			// ある程度カーソル移動したらドラッグ開始
			if( (Math.abs(ev.pageX-downX) +Math.abs(ev.pageY-downY)) >20 ){
				// カーソルと共に移動する要素
				$dragi = $(element).css({ position:'absolute' ,opacity:0.4 });
				// 閉パネルポップアップ停止(しないとおかしな場所にポップアップして幽霊のようになる)
				if( $dragi.find('.plusminus').attr('src')=='plus.png' )
					$dragi.off().find('.itembox').hide();
				// ドロップ場所
				$place = $('<div class=paneldrop></div>')
						.css('marginLeft',$dragi.css('marginLeft'))
						.css('marginTop',$dragi.css('marginTop'))
						.height( option.font.size() +option.icon.size() +5 );
			}
		}
		$doc.on('mousemove.dragdrop',function(ev){
			if( !$dragi ) dragStart(ev);
			if( $dragi ){
				// スクロール制御
				// TODO:スクロール後にマウス動かさないとドロップ場所がついてこない。
				dragScroll(ev,function( dx ,dy ){
					ev.pageX += dx;
					ev.pageY += dy;
					// ドラッグ物
					$dragi.css({ left:ev.pageX+5, top:ev.pageY+5 });
				});
			}
		})
		.on('mousemove.dragdrop','.panel',function(ev){
			if( !$dragi ) dragStart(ev);
			if( $dragi ){
				// ドロップ場所
				if( this.id==element.id ) return;
				var $this = $(this);
				// offsetTopは親要素(.itembox)からの相対値になってしまうのでoffset().top利用
				if( ev.pageY <= $this.offset().top + this.offsetHeight/2 ){
					if( $this.prev() != $place ) $this.before( $place );
				}
				else{
					if( $this.next() != $place ) $this.after( $place );
				}
			}
		})
		.on('mousemove.dragdrop','.column',function(ev){
			if( !$dragi ) dragStart(ev);
			if( $dragi ){
				// ドロップ場所
				var $col = $(ev.target);
				if( $col.hasClass('column') ){
					var $next = null;
					for( var i=ev.target.children.length; i--; ){
						var $panel = $(ev.target.children[i]);
						if( $panel.hasClass('panel') && !$panel.hasClass('active') ){
							if( ev.pageY < $panel.offset().top + $panel.outerHeight()/2 )
								$next = $panel;
						}
					}
					if( $next ) $next.before( $place );
					else $col.append( $place );
				}
			}
		})
		.one('mouseup',function(ev){
			// スクロール停止
			dragScroll(false);
			// イベント解除
			$doc.off('mousemove.dragdrop mouseleave.dragdrop');
			// ドロップ並べ替え終了
			if( $place ){
				if( $place.parent().hasClass('column') ) $place.after( $dragi );
				$place.remove(); $place=null;
				$dragi.css({ position:'' ,opacity:'' });
				// 閉パネルポップアップ再開
				if( $dragi.find('.plusminus').attr('src')=='plus.png' ){
					$dragi.find('.plusminus').attr({ src:'minus.png', title:'閉じる' });
					panelOpenClose( $dragi[0].id );
				}
				$dragi=null;
				option.panel.layouted();
				columnHeightAdjust();
			}
			$(element).removeClass('active');	// スタイル解除
		})
		// 右クリックメニューが消えなくなったのでここで実行
		.trigger('mousedown');
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
			// if( IE && IE<9 && !ev.button ) return $doc.mouseup();
			// としてみたところ、ドラッグ開始後にその要素が元あった場所に入るとなぜかmouseup
			// が発生してドラッグ終了してしまうイヤな挙動になった。なぜ？？？わからないので、
			// IE8はウィンドウ外に出たらドラッグ中止する。
			// ちなみにjQueryでも、ウィンドウ外でボタンを離したあと、また押した状態で戻って
			// きた場合は、ドラッグが中断したまま動かない表示になる。
			$doc.on('mouseleave.dragdrop',function(){
				if( $place ) $(element).after( $place );	// 元の場所で
				$doc.mouseup();								// ドロップ
			});
			// TODO:IE8はなぜかエラー発生させればドラッグ可能になる　→dragstartイベント調査(A,IMGには既定のドラッグ挙動がある)
			xxxxx;
		}
		// Firefoxはreturn falseしないとテキスト選択になってしまう…
		else return false;
	});
}
// パネルアイテム並べ替え
// TODO:閉パネルアイテムをドラッグして外に出て（ポップアップ消えて）、また戻る（ポップアップする）と
// ドラッグアイテムの半透明化が解除されている。ポップアップ処理の方でアイテムがドラッグ中かどうか判別
// しないとダメかな・・面倒くさそう・・。
function itemSortable(){
	var node = null;
	var isFindBox = false;
	$doc.on('mousedown','.item',function(ev){
		var element = this;
		var downX = ev.pageX;
		var downY = ev.pageY;
		var $dragi = null;				// ドラッグ物
		var $place = null;				// ドロップ場所
		$(element).addClass('active');	// スタイル(FirefoxでなぜかCSSの:activeが効かないので)
		function dragStart(ev){
			// ある程度カーソル移動したらドラッグ開始
			if( (Math.abs(ev.pageX-downX) +Math.abs(ev.pageY-downY)) >20 ){
				// 要素は閉パネルポップアップで削除される事があるので元ノード情報を保持
				if( /^fd\d+$/.test(element.id) ){
					// 検索ボックスアイテム(ごみ箱も含む)
					isFindBox = true;
					node = tree.node( element.id.slice(2), tree.root );
				}
				else{
					// パネルアイテム(ごみ箱は含まない)
					node = tree.node( element.id );
				}
				if( node ){
					// 元の要素は半透明に
					var $item = $(element).css('opacity',0.4);
					// カーソルと共に移動する要素作成
					$dragi = $('<div class=panel></div>')
							.css({ position:'absolute', 'font-size':option.font.size() })
							.width( $item.width() )
							.append( $('<a class=item></a>').append( $item.children().clone() ) )
							.appendTo( document.body );
					// ドロップ場所要素作成
					$place = $('<div></div>').addClass('itemdrop');
				}
			}
		}
		$doc.on('mousemove.dragdrop',function(ev){
			if( !$dragi ) dragStart(ev);
			if( $dragi ){
				// スクロール制御
				// TODO:スクロール後にマウス動かさないとドロップ場所がついてこない。
				dragScroll(ev,function( dx ,dy ){
					ev.pageX += dx;
					ev.pageY += dy;
					// ドラッグ物
					$dragi.css({ left:ev.pageX+5, top:ev.pageY+5 });
				});
			}
		})
		.on('mousemove.dragdrop','.item',function(ev){
			if( !$dragi ) dragStart(ev);
			if( $dragi ){
				// ドロップ場所
				if( this.id==element.id ) return;
				if( this.id==$dragi[0].id ) return;
				if( /^fd/.test(this.id) ) return; // 検索結果ドロップ無効
				var $item = $(this);
				// offsetTopは親要素(.itembox)からの相対値になってしまうのでoffset().top利用
				if( ev.pageY <= $item.offset().top + this.offsetHeight/2 ){
					if( $item.prev() != $place ) $item.before( $place );
				}
				else{
					if( $item.next() != $place ) $item.after( $place );
				}
			}
		})
		.on('mousemove.dragdrop','.panel',function(ev){
			if( !$dragi ) dragStart(ev);
			if( $dragi ){
				// 空パネル
				var $box = $(this).children('.itembox');
				if( $box[0].children.length==0 ) $box.append( $place );
			}
		})
		.one('mouseup',function(ev){
			// スクロール停止
			dragScroll(false);
			// イベント解除
			$doc.off('mousemove.dragdrop mouseleave.dragdrop');
			// ドロップ並べ替え終了
			if( node ){
				var apply = true;
				if( isFindBox ){
					// 検索ボックスアイテムは検索ボックス上or画面外ドロップでキャンセル
					if( elementHasXY( document.getElementById('findbox'), ev.clientX, ev.clientY ) ||
						elementHasXY( document.getElementById('findtab'), ev.clientX, ev.clientY ) ||
						!elementHasXY( $wall[0], ev.pageX, ev.pageY )
					){
						apply = false;
					}
					$('#fd'+node.id).css('opacity','');
					isFindBox = false;
				}
				if( apply && !$place.parent().hasClass('itembox') ){
					// ドロップ場所未定キャンセル
					apply = false;
					$('#'+node.id).css('opacity','');
				}
				if( apply ){
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
					columnHeightAdjust();
				}
				$dragi.remove(); $dragi=null;
				$place.remove(); $place=null;
				node = null;
			}
			$(element).removeClass('active');	// スタイル解除
		})
		// 右クリックメニューが消えなくなったのでここで実行
		.trigger('mousedown');
		if( IE && IE<9 ){
			// see panelSortable()
			$doc.on('mouseleave.dragdrop',function(){
				if( $place ) $(element).after( $place );	// 元の場所で
				$doc.mouseup();								// ドロップ
			});
			// TODO:IE8はなぜかエラー発生させればドラッグ可能になる　→dragstartイベント調査(A,IMGには既定のドラッグ挙動がある)
			xxxxx;
		}
		// Firefoxはreturn falseしないとテキスト選択になってしまう…
		else return false;
	});
}
// optionApplyと重複
function panelReady(){
	document.title = option.page.title();
	$('#colorcss').attr('href',option.color.css());
	$('#fontcss').attr('href',option.font.css());
	var fontSize = option.font.size();
	var iconSize = option.icon.size();
	var panelWidth = option.panel.width();
	var panelMarginTop = option.panel.margin.top();
	var panelMarginLeft = option.panel.margin.left();
	var columnWidth = panelWidth + panelMarginLeft +2;	// +2 適当たぶんボーダーぶん
	$wall.empty().width( columnWidth * option.column.count() ).css({
		'padding-right':panelMarginLeft
		,margin:option.wall.margin()
	});
	// カラム元要素
	$columnBase.width( columnWidth );
	// パネル元要素
	$panelBase.width( panelWidth ).css({
		'font-size':fontSize
		,margin:panelMarginTop +'px 0 0 ' +panelMarginLeft +'px'
	});
	$panelBase.find('.title span').css('vertical-align',(iconSize/2)|0);
	$panelBase.find('.icon').width( fontSize +3 +iconSize ).height( fontSize +3 +iconSize );
	$panelBase.find('.pen, .plusminus').width( fontSize +iconSize ).height( fontSize +iconSize );
	// パネルアイテム元要素
	$itemBase.find('span').css('vertical-align',(iconSize/2)|0 );
	$itemBase.find('.icon').width( fontSize +3 +iconSize ).height( fontSize +3 +iconSize );
}
// パラメータ変更反映
function optionApply(){
	var fontSize = option.font.size();
	var iconSize = option.icon.size();
	var panelWidth = option.panel.width();
	var panelMarginTop = option.panel.margin.top();
	var panelMarginLeft = option.panel.margin.left();
	var columnWidth = panelWidth +panelMarginLeft +2;	// +2 適当たぶんボーダーぶん
	$wall.width( columnWidth * option.column.count() ).css({
		'padding-right':panelMarginLeft
	});
	$wall.children('.column').width( columnWidth );
	$wall.find('.panel').width( panelWidth ).css({
		'font-size':fontSize
		,margin:panelMarginTop +'px 0 0 ' +panelMarginLeft +'px'
	});
	$wall.find('.title span').css('vertical-align',(iconSize/2)|0);
	$('.item span').css('vertical-align',(iconSize/2)|0);
	$('.icon').width( fontSize +3 +iconSize ).height( fontSize +3 +iconSize );
	$('.pen, .plusminus').width( fontSize +iconSize ).height( fontSize +iconSize );
	$('#newurl').css('font-size',fontSize).height( fontSize +3 );
	$('#foundbox').css('font-size',fontSize);
	// パネル元要素
	$panelBase.width( panelWidth ).css({
		'font-size':fontSize
		,margin:panelMarginTop +'px 0 0 ' +panelMarginLeft +'px'
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
		for( var i=0, n=count.prev; i<n; i++ ) $column[i] = $('#co'+i);
		// 消えるカラムにあるパネルを残るカラムに分配
		var distination=0;
		for( var i=count.next, n=count.prev; i<n; i++ ){
			$column[i].children('.panel').each(function(){
				$(this).appendTo( $column[distination%count.next] );
				distination++;
			});
			// 分配おわりカラムDOMエレメント削除
			$column[i].remove();
		}
	}
	columnHeightAdjust();
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
		,buttons:{ ' O K ':ok ,'キャンセル':close }
	});
	if( arg.val ) $input.val( arg.val ).select();
	function ok(){ arg.ok( $input.val() ); close(); }
	function close(){ $input.remove(); $('#dialog').dialog('destroy'); }
}
// ログインダイアログ
function LoginDialog( arg ){
	var $input = $('<input type=password>').width(250)
		.css({
			padding:'0 0 0 2px'
			,margin:'0 0 0 9px'
		})
		.keypress(function(ev){
			switch( ev.which || ev.keyCode || ev.charCode ){
			case 13: ok(); return false; // Enterで反映
			}
		});

	$('#dialog')
		.html('JCBookmarkのパスワードを入力してログインしてください。<br><br>　パスワード')
		.append( $input )
		.dialog({
			 title	:'ログインセッションがありません'
			,modal	:true
			,width	:440
			,height	:210
			,close	:close
			,buttons:{ '　ログイン　':ok ,'キャンセル':close }
		});

	function ok(){
		$.ajax({
			type:'post'
			,url:':login'
			,data:{ p:$input.val() }
			,success:function(data){ document.cookie = 'session='+data +'; path=/;'; }
			,complete:function(){
				$input.remove();
				$('#dialog').dialog('destroy');
				if( arg && arg.ok ) arg.ok();
			}
		});
	}
	function close(){
		$input.remove();
		$('#dialog').dialog('destroy');
		if( arg && arg.cancel ) arg.cancel();
	}
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
	opt.buttons['キャンセル'] = function(){ $(this).dialog('destroy'); if( arg.cancel ) arg.cancel(); }

	if( arg.width ){
		var maxWidth = $win.width() -100;
		if( arg.width > maxWidth ) arg.width = maxWidth;
		else if( arg.width < 300 ) arg.width = 300;
		opt.width = arg.width;
	}
	if( arg.height ){
		var maxHeight = $win.height() -100;
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
// URLエスケープ(エクスポートHTML用)
function URLesc( s ){
	var reg = /[ "]/g;
	var map = {
		 ' ':'%20'
		,'"':'%22'
	};
	return s.replace(reg,function(m){ return map[m]; });
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
// 数値3桁カンマ区切り
function N3C( n ){
	return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
// URL先頭プロトコル文字列除去
String.prototype.noProto = function(){ return this.replace(/^https?:\/\//,''); };
// URLホスト部を取得
String.prototype.hostName = function(){
	return (/^\w+:\/\/([^\/]+)/.test(this)) ? RegExp.$1.toLowerCase() :'';
};
// 検索用に文字列を正規化
// http://logicalerror.seesaa.net/article/275434211.html
// http://www.openspc2.org/reibun/javascript/business/003/
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

})( $
	,$(window), $(document)
	,Object.prototype.toString						// 型判定用
	,window.ActiveXObject? document.documentMode:0	// IE判定用
	,$('#wall'), $('#sidebar')
);
