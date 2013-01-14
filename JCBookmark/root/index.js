// vim:set ts=4:vim modeline
// TODO:jQueryUIのsortableをやめて独自実装にして、ブックマークも並べ替えやフォルダ移動できるように。
// TODO:ブックマークのコンテキストメニューで名前変更。そうするとURLコピーができないのが難点だが、
// テキスト表示メニューがあればいいかな？あと削除もできるように。
// TODO:リンク切れ検査機能。単にGETして200/304/404を緑/黄/赤アイコンで表示すればいいかな。
// TODO:パネル色分け。既定のセットがいくつか選べて、さらに自由にRGBかHSVで決められる感じかな。
// TODO:検索・ソート機能。う～んまずは「最近登録したものから昇順に」かな・・結果は別ウィンドウかな。
// TODO:一括でパネル開閉。閉パネルはDOM要素を(非表示でなく)削除してメモリ節約。
(function($){
/*
var start = new Date(); // 測定
var $debug = $('<div></div>').css({
		id:'debug'
		,position:'fixed'
		,left:'0'
		,top:'0'
		,width:'200px'
		,background:'#fff'
		,border:'1px solid #000'
		,padding:'2px'
		,'font-size':'12px'
}).appendTo(document.body);
*/
// キャッシュ
var IE = window.ActiveXObject ? document.documentMode : 0;
var $window = $(window);
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
			if( on ) $('#modified').show();
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
		(function( node ){
			node.id = tree.root.nextid++;
			if( node.child ){
				for( var i=0, n=node.child.length; i<n; i++ )
					arguments.callee( node.child[i] );
			}
		})( subtree );
		// トップノード(固定)child配列に登録
		tree.top().child.push( subtree ); // 最後に
		tree.modified(true);
		return tree;
	}
	// 指定ノードIDを持つノードオブジェクト(ごみ箱は探さない)
	,node:function( id ){
		return function( node ){
			if( node.id==id ){
				// 見つけた
				return node;
			}
			if( node.child ){
				for( var i=0, n=node.child.length; i<n; i++ ){
					var found = arguments.callee( node.child[i] );
					if( found ) return found;
				}
			}
			return null;
		}( tree.top() );
	}
	// 新規アイテム作成
	,newURL:function( url ){
		var node = {
			id		: tree.root.nextid++
			,dateAdded	:(new Date()).getTime()
			,title	: url.replace(/^https?:\/\//,'')
			,url	: url
			,icon	: ''
		};
		// topのchild先頭に追加
		tree.top().child.unshift( node );
		// 変更メッセージ
		tree.modified(true);
		return node;
	}
	// 属性変更
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
	,path:'tree.json'
	// ノードツリー取得
	,load:function( onSuccess ){
		$.ajax({
			url:tree.path
			,error:function(xhr,text){ Alert('データ取得できません:'+text); }
			,success:function(data){
				tree.replace( data );
				if( onSuccess ) onSuccess();
			}
			,beforeSend:function(xhr){
				// IEキャッシュ対策 http://d.hatena.ne.jp/hasegawayosuke/20090925/p1
				xhr.setRequestHeader('If-Modified-Since','Thu, 01 Jun 1970 00:00:00 GMT');
			}
		});
	}
	// ノードツリー保存
	// TODO:たまにChromeでPUTされない時がある。エラーは出ないし、PUTされないのに
	// onSuccessは実行されてしまうし、かなりイヤな感じ。なにがきっかけか不明だが
	// けっこう発生する。他のブラウザでは見たこと無い。
	,save:function( onSuccess ){
		$.ajax({
		//ajax({
			type	:'put'
			,url	:tree.path
			,data	:JSON.stringify( tree.root )
			,error	:function(xhr,text){ Alert('保存できませんでした:'+text); }
			,success:function(){
				tree.modified(false);
				if( onSuccess ) onSuccess();
			}
		});
	}
};
// パネルオプション
// TODO:treeの中に入れる＝tree.jsonに保存した方が楽？
var option = {
	data:{
		// 空(規定値ではない)を設定
		page	:{ title:null }
		,color	:{ css	:'' }
		,font	:{ size	:-1 }
		,column	:{ count:-1 }
		,panel	:{
			layout	:{}
			,status	:{}
			,margin	:-1
			,width	:-1
		}
	}
	,_modified:false
	,modified:function( on ){
		if( arguments.length ){
			option._modified = on;
			if( on ) $('#modified').show();
			return option;
		}
		return option._modified;
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
			if( column.count<0 ) column.count = ~~($window.width() /230);
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
		,status:function( val ){
			if( arguments.length ){
				option.data.panel.status = val;
				// パネルの開閉でいちいち「保存しろ」メッセージが出るのは使いづらい？
				// なにもメッセージ出さず自動保存してしまう方がいいかな？
				//option.modified(true);
				option.save();
				return option;
			}
			return option.data.panel.status;
		}
		,margin:function( val ){
			if( arguments.length ){
				option.data.panel.margin = val |0;
				option.modified(true);
				return option;
			}
			var panel = option.data.panel;
			// 一度目の参照時に規定値を設定(px)
			if( panel.margin<0 ) panel.margin = 1;
			return panel.margin;
		}
		,width:function( val ){
			if( arguments.length ){
				option.data.panel.width = val |0;
				option.modified(true);
				return option;
			}
			var panel = option.data.panel;
			// 一度目の参照時に規定値を設定(px)
			if( panel.width<0 ) panel.width = ~~(($window.width() -27) /option.column.count() -option.panel.margin());
			return panel.width;
		}
	}
	,path:'index.json'
	// オプション取得：エラー無視
	,load:function( onComplete ){
		$.ajax({
			url:option.path
			,success:function(data){ option.data = data; }
			,complete:onComplete
			,beforeSend:function(xhr){
				// IEキャッシュ対策 http://d.hatena.ne.jp/hasegawayosuke/20090925/p1
				xhr.setRequestHeader('If-Modified-Since','Thu, 01 Jun 1970 00:00:00 GMT');
			}
		});
		return option;
	}
	// オプション保存
	,save:function( onSuccess ){
		$.ajax({
			type	:'put'
			,url	:option.path
			,data	:JSON.stringify( option.data )
			,error	:function(xhr,text){ Alert('設定を保存できません:'+text); }
			,success:function(){
				option.modified(false);
				if( onSuccess ) onSuccess();
			}
		});
		return option;
	}
};
// CSSルールの追加削除
// http://d.hatena.ne.jp/ofk/20090716/1247719727
// スタイルルールの操作
// http://ash.jp/web/css/js_style.htm
// jQuery.Ruleプラグイン
// http://flesler.blogspot.jp/2007/11/jqueryrule.html
if( $.css.add==null ){
	$.css.add=function(a,b){var c=$.css.sheet,d=!$.browser.msie,e=document,f,g,h=-1,i="replace",j="appendChild";if(!c){if(d){c=e.createElement("style");c[j](e.createTextNode(""));e.documentElement[j](c);c=c.sheet}else{c=e.createStyleSheet()}$.css.sheet=c}if(d)return c.insertRule(a,b||c.cssRules.length);if((f=a.indexOf("{"))!==-1){a=a[i](/[\{\}]/g,"");c.addRule(a.slice(0,f)[i](g=/^\s+|\s+$/g,""),a.slice(f)[i](g,""),h=b||c.rules.length)}return h};
	$.css.remove=function(a){var b=$.css.sheet;b&&b[$.browser.msie?"removeRule":"deleteRule"](a)};
}
// ドキュメント全体
$(document).on({
	mousedown:function(ev){
		// 右クリックメニュー隠す
		if( !$(ev.target).is('#contextmenu,#contextmenu *') ){
			$('#contextmenu').hide().find('a').off();
		}
	}
	// サイドバーにマウスカーソル近づいたらスライド出現させる。
	// #sidebar の width を 34px → 65px に変化させる。index.css とおなじ値を使う必要あり。
	,mousemove:(function(){
		var animate = null;
		return function(ev){
			if( ev.clientX <37 && ev.clientY <260 ){	// サイドバー周辺にある程度近づいた
				if( !animate )
					animate = $sidebar.animate({width:65});
			}
			else if( animate ){							// サイドバーから離れてるとき隠す
				$sidebar.stop(true).width(34);
				animate = null;
			}
		};
	})()
});
// ブックマークデータ取得
(function(){
	var option_ok = false;
	var tree_ok = false;
	var paneler_ok = false;
	// 並列通信して後に終わった方がpaneler()実行する
	option.load(function(){
		option_ok = true;
		document.title = option.page.title();
		if( tree_ok && !paneler_ok ){
			paneler_ok = true;
			paneler( tree.top() );
		}
	});
	tree.load(function(){
		tree_ok = true;
		if( option_ok && !paneler_ok ){
			paneler_ok = true;
			paneler( tree.top() );
		}
	});
})();
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
function paneler( nodeTop ){
	$wall.empty();
	// パネル生成
	var $panel = function(){
		var $e = $('<div class=panel><div class=itembox></div></div>')
			.prepend(
				$('<div class=title><img class=icon src="folder.png"><span></span></div>')
				.on({
					// ダブルクリックでパネル開閉
					// TODO:表示/非表示切り替えでなく要素の追加/削除にすれば、非表示のときメモリ節約になるか
					dblclick:function(){
						// 自分(.title)の親つまりパネルID=XXならボックスID=boxXXでボタンID=btnXX
						var $box = $('#box'+this.parentNode.id);
						var $btn = $('#btn'+this.parentNode.id);
						if( $box.css('display')=='none' ){
							$box.show();
							$btn.attr('src','minus.png');
						}else{
							$box.hide();
							$btn.attr('src','plus.png');
						}
						changeStatus();
					}
					// 右クリックメニュー
					,contextmenu:function(ev){
						// ev.targetはクリックした場所にあるDOMエレメント
						var panel = ev.target.parentNode;
						while( panel.className !='panel' ){
							if( !panel.parentNode ) break;
							panel = panel.parentNode;
						}
						var $menu = $('#contextmenu').find('a').off().end();
						// アイテムすべて開く
						// IE8とOpera12だと設定でポップアップを許可しないと１つしか開かない。Chromeも23でダメに。
						$('#allopen').click(function(){
							$menu.hide();
							$(panel).find('.item').each(function(){
								window.open( this.getAttribute('href') );
							});
						});
						// アイテムテキストで取得
						$('#showtext').click(function(){
							$menu.hide();
							var text='';
							$(panel).find('.item').each(function(){
								text += $(this).text() + '\r' + this.getAttribute('href') + '\r';
							});
							$('#itemtext').find('textarea').text(text).end().dialog({
								title	:'アイテムをテキストで取得'
								,modal	:true
								,width	:480
								,height	:360
								,close	:function(){ $(this).dialog('destroy'); }
							});
						});
						// 表示
						$menu.css({
							left: (($window.width() -ev.pageX) <$menu.width())? ev.pageX -$menu.width() : ev.pageX
							,top: (($window.height() -ev.pageY) <$menu.height())? ev.pageY -$menu.height() : ev.pageY
						}).show();
						return false;	// 既定右クリックメニュー出さない
					}
				})
				.prepend(
					$('<img class=plusminus src="minus.png">')
					// パネル開閉
					// TODO:表示/非表示切り替えでなく要素の追加/削除にすれば、非表示のときメモリ節約になるか
					.click(function(){
						// 自身のID=btnXXならボックスID=boxXX
						var $box = $('#box'+this.id.slice(3));
						if( $box.css('display')=='none' ){
							$box.show();
							this.src = 'minus.png';
						}else{
							$box.hide();
							this.src = 'plus.png';
						}
						changeStatus();
					})
				)
			);
		return function( node ){
			return $e.clone(true)
				.attr('id',node.id)
				.find('span').text( node.title ).end()
				.find('.plusminus').attr('id','btn'+node.id).end()
				.find('.itembox').attr('id','box'+node.id).end();
		};
	}();
	var $item = function(){
		var $e = $('<a class=item target="_blank"><img class=icon><span></span></a>');
		return function( node ){
			return $e.clone()
				.attr({
					id		: node.id
					,href	: node.url
					,title	: node.title
				})
				.find('img').attr('src', node.icon ||'item.png').end()
				.find('span').text( node.title ).end();
		};
	}();
	var panels = [];
	var idpanel = {};
	(function( node ){
		var $p = $panel( node );
		var $box = $p.find('.itembox');
		panels.push( $p );
		idpanel[node.id] = $p;
		for( var i=0, n=node.child.length; i<n; i++ ){
			if( node.child[i].child )
				arguments.callee( node.child[i] );
			else
				$box.append( $item(node.child[i]) );
		}
	})( nodeTop );
	// パネル並べ段組みBOX
	(function(){
		var max = option.column.count();
		var column = {};
		for( var i=0; i<max; i++ ){
			column['co'+i] = {
				$e: $('<div id=co'+i+' class=column></div>').appendTo( $wall )
				,height: 0
			};
		}
		// float解除
		$wall.append('<br class=clear>');
		// 高さがいちばん低いカラムオブジェクトを返す
		var lowestColumn = function(){
			var target = null;
			for( var id in column ){
				if( !target )
					target = column[id];
				else if( target.height > column[id].height )
					target = column[id];
			}
			return target;
		};
		// 自動並べ
		for( var i=0; i<panels.length; i++ ){
			// 一番低い段に振り分けていく
			var col = lowestColumn();
			col.$e.append( panels[i] );
			col.height += panels[i].height();
		}
		// レイアウト保存データ反映
		// キーがカラム(段)ID、値がパネルIDの配列の連想配列
		// { co0: [ 1,22,120,45 ], co1: [3,5,89], ... }
		var layout = option.panel.layout();
		for( var target in layout ){
			var ids = layout[target];
			if( target in column ){
				// カラムあり
				var col = column[target].$e;
				for( var i=0; i<ids.length; i++ ){
					col.append( idpanel[ids[i]] );
				}
			}else{
				// カラムないので適当に分配
				for( var i=0; i<ids.length; i++ ){
					column['co'+(i%max)].$e.append( idpanel[ids[i]] );
				}
			}
		}
	})();
	// 新規URL投入BOX
	// TODO:IE8/Firefoxで文字列をマウスでドラッグ選択できない。あれ？前からだっけ？
	// jQuery:sortable()をやめたらできるようになった…うーむ…。
	// TODO:Operaで右クリックメニューからの貼り付けができない(Ctrl+Vはできる)
	// jQuery.sortable()をやめたら選択できるようだ…jQueryとの相性か…
	panels[0].find('.itembox').before(
		$('<input id=newurl placeholder="新規ブックマークURL" title="新規ブックマークURL">').on({
			// 新規登録
			commit:function(){
				var node = tree.newURL( this.value );
				if( node ){
					// DOM要素追加
					$(this.parentNode).find('.itembox').prepend( $item( node ) );
					// URLタイトル、favicon取得
					// TwitterのURLでhttp://twitter.com/#!/hogeなど'#'が含まれる場合があるが、
					// '#'以降の文字列が消えてリクエストされてしまう。'#'がページ内リンクとみなされ
					// て消される？jQueryの仕様？encodeURIComponent()を使えば'#'を'%23'にエンコード
					// できるが、他にもいっぱいエンコードされてサーバ側のデコード処理がたいへん。'#'
					// 以外は$.get()が自動でエンコードしてくれる内容で問題なさそうなのでそうしたい。
					// とりあえず'#'だけ'%23'に置換して送信する。Twitterサーバは'#'が'%23'になって
					// ると404を返すので、サーバ側で'#'に戻してリクエストを送る。が、Twitterはいま
					// は/#!/の応答では200を返すけどタイトルは単なる「Twitter」で、結局/#!/無しURL
					// にリダイレクトされるようだ。他のサイトで悪影響が出ないといいけど・・
					// 知らなかったがescape()関数もあったようだ。これは#を%23にしてくれるが…
					// まあいいかとりあえず動いてるし…。
					// http://groundwalker.com/blog/2007/02/javascript_escape_encodeuri_encodeuricomponent_.html
					$.get(':analyze?'+this.value.replace(/#/g,'%23'),function(data){
						if( data.title.length ){
							data.title = HTMLtext( data.title );
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
			// マウスダウンでフォーカス与えないとOperaで入力できない対策
			// Operaで右クリックメニューからの貼り付けができない問題=jQuery:sortable相性問題と同じかな？
			,mousedown:function(){ this.focus(); }
		})
		.on('input keyup paste',function(){
			// 文字列がある時だけ登録ボタン生成
			// なぜかsetTimeout()しないと動かない…この時点ではvalueに値が入ってないからかな？
			setTimeout(function(){
				var $newurl = $('#newurl');
				if( $newurl.val().length ){
					if( $newurl.next().attr('id')!='commit' )
						$newurl.after(
							$('<div id=commit tabindex=0>↓↓↓新規登録↓↓↓</div>').on({
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
	// パネル開閉状態反映
	// TODO:表示/非表示切り替えでなく要素の追加/削除にすれば、非表示のときメモリ節約になるか
	(function(){
		var status = option.panel.status();
		for( var btnN in status ){
			var $btn = $('#'+btnN);				// 開閉ボタンエレメント
			var $box = $('#box'+btnN.slice(3));	// ボックスIDは、ボタンID=btnXXならボックスID=boxXX
			if( status[btnN]==0 ){
				$btn.attr('src','minus.png');
				$box.show();
			}else{
				$btn.attr('src','plus.png');
				$box.hide();
			}
		}
	})();
	// スタイル
	playLocalParam();
	// Drag&Drop並べ替え開始
	setSortable();
	// 測定
	//$debug[0].innerHTML +=',paneler='+((new Date()).getTime() -start.getTime())+'ms';
}
// ノードツリー変更保存リンク
$('#modified').click(function(){
	// 順番に保存
	tree.modified()? tree.save( optionSave ) : optionSave();
	function optionSave(){
		option.modified()? option.save(function(){$('#modified').hide();}) : $('#modified').hide();
	}
});
// パネル設定ダイアログ
$('#optionico').click(function(){
	// ページタイトル
	$('#page_title').val( option.page.title() )
	.off().on('input keyup paste',function(){
		if( this.value != option.page.title() ){
			option.page.title( this.value );
			document.title = this.value;
		}
	});
	// 色テーマ
	$('input[name=colorcss]').each(function(){
		if( this.value==option.color.css() )
			$(this).attr('checked','checked');
	})
	.off().change(function(){
		option.color.css( this.value );
		$('#colorcss').attr('href',this.value);
	});
	// パネル幅
	$('#panel_width').val( option.panel.width() )
	.off().on('input keyup paste',function(){
		if( !this.value.match(/^\d{3,4}$/) || this.value <100 || this.value >1000 ) return;
		if( this.value !=option.panel.width() ){
			option.panel.width( this.value );
			playLocalParam();
		}
	});
	$('#panel_width_inc').off().click(function(){
		var val = option.panel.width();
		if( val <1000 ){
			option.panel.width( ++val );
			playLocalParam();
			$('#panel_width').val( val );
		}
	});
	$('#panel_width_dec').off().click(function(){
		var val = option.panel.width();
		if( val >100 ){
			option.panel.width( --val );
			playLocalParam();
			$('#panel_width').val( val );
		}
	});
	// パネル余白
	$('#panel_margin').val( option.panel.margin() )
	.off().on('input keyup paste',function(){
		if( !this.value.match(/^\d{1,3}$/) || this.value < 0 || this.value > 100 ) return;
		if( this.value !=option.panel.margin() ){
			option.panel.margin( this.value );
			playLocalParam();
		}
	});
	$('#panel_margin_inc').off().click(function(){
		var val = option.panel.margin();
		if( val <100 ){
			option.panel.margin( ++val );
			playLocalParam();
			$('#panel_margin').val( val );
		}
	});
	$('#panel_margin_dec').off().click(function(){
		var val = option.panel.margin();
		if( val >0 ){
			option.panel.margin( --val );
			playLocalParam();
			$('#panel_margin').val( val );
		}
	});
	// 列数
	$('#column_count').val( option.column.count() )
	.off().on('input keyup paste',function(){
		if( !this.value.match(/^\d{1,2}$/) || this.value < 1 || this.value > 30 ) return;
		if( this.value !=option.column.count() ){
			changeColumnCount( { prev:option.column.count(), next:this.value } );
			option.column.count( this.value );
			playLocalParam();
		}
	});
	$('#column_count_inc').off().click(function(){
		var val = option.column.count();
		if( val <30 ){
			changeColumnCount( { prev:val, next:val+1 } );
			option.column.count( ++val );
			playLocalParam();
			$('#column_count').val( val );
		}
	});
	$('#column_count_dec').off().click(function(){
		var val = option.column.count();
		if( val >1 ){
			changeColumnCount( { prev:val, next:val-1 } );
			option.column.count( --val );
			playLocalParam();
			$('#column_count').val( val );
		}
	});
	// フォントサイズ
	$('#font_size').val( option.font.size() );
	$('#font_size_inc').off().click(function(){
		var val = option.font.size();
		if( val <24 ){
			option.font.size( ++val );
			playLocalParam();
			$('#font_size').val( val );
		}
	});
	$('#font_size_dec').off().click(function(){
		var val = option.font.size();
		if( val >9 ){
			option.font.size( --val );
			playLocalParam();
			$('#font_size').val( val );
		}
	});
	// ダイアログ表示
	$('#option').dialog({
		title		:'パネル設定'
		,modal		:true
		,width		:390
		,height		:290
		,close		:function(){ $(this).dialog('destroy'); }
		,buttons	:{
			'パネル設定クリア':function(){
				option.font.size(-1).column.count(-1).panel.margin(-1).panel.width(-1);
				$('#panel_width').val( option.panel.width() );
				$('#panel_margin').val( option.panel.margin() );
				$('#column_count').val( option.column.count() );
				$('#font_size').val( option.font.size() );
				playLocalParam();
			}
			,'パネル配置クリア':function(){
				option.panel.layout({}).panel.status({});
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
		msg	:'変更が保存されていません。保存しますか？'
		,no	:function(){ gotoFiler(); }
		,yes:function(){
			// 順番に保存
			tree.modified()? tree.save( optionSave ) : optionSave();
			function optionSave(){
				option.modified()? option.save( gotoFiler ) : gotoFiler();
			}
		}
	});
	// filer.htmlを単純に開いてもいいけど、index.htmlとfiler.htmlで同時ツリー変更できないので、
	// 同じURLで動作させるためiframeで開く。
	function gotoFiler(){
		//$debug.remove();
		$('#modified,#wall,#sidebar,#option,#contextmenu,#itemtext,#dialog').remove();
		$('#filer').width($window.width()).height($window.height()).show().attr('src','filer.html');
		$window.on('resize',function(){
			$('#filer').width($window.width()).height($window.height());
		});
	}
});
// ブラウザ情報＋インポートイベント
$.ajax({
	url		:':browser.json'
	,error	:function(xhr,text){ Alert("ブラウザ情報取得エラー:"+text); }
	,success:function( browser ){
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
				Confirm({
					msg:'Chromeブックマークデータを取り込みます。#BR#データ量が多いと時間がかります。'
					,ok:function(){
						var work={
							cancel	 :false
							,ajax1	 :null
							,ajax2	 :null
							,analyze :[]
							,progress:Progress(function(){
								// キャンセルクリック：ダイアログはすぐ消えるがバックエンドは
								// すぐには終わらないようで、5～6秒は処理が続いてしまう感じ。
								work.cancel = true;
								if( work.ajax1 ) work.ajax1.abort();
								if( work.ajax2 ) work.ajax2.abort();
								var analyze = work.analyze;
								for( var i=0; i<analyze.length; i++ ){
									analyze[i].ajax.abort();
									analyze[i].done = true;
								}
							})
						};
						work.ajax1 = $.ajax({
							url		:':chrome.json'
							,error	:function(xhr,text){ Alert("データ取得エラー:"+text); }
							,success:function( bookmarks ){
								var favicons={};
								work.ajax2 = $.ajax({
									url		 :':chrome.icon.json'
									,success :function(data){ favicons=data; }
									,complete:function(){
										var analyze = work.analyze;
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
										// Chromeノードから自ノード形式変換
										var chrome2node = function( data ){
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
											var jstime = function( date_added ){
												var t = (parseFloat(date_added||0) -11644473600000000.0) /1000.0;
												return ( t >0 )? parseInt(t) : 0;
											};
											var node = {
												id			:root.nextid++				// 新規ID
												,dateAdded	:jstime( data.date_added )	// 変換
												,title		:data.name					// 移行
											};
											if( data.children ){
												// フォルダ
												node.child = [];
												for( var i=0, n=data.children.length; i<n; i++ ){
													node.child.push( arguments.callee( data.children[i] ) );
												}
											}else{
												// ブックマーク
												node.url = data.url;
												node.icon = favicons[data.url];
												if( !node.icon ){
													// favicon解析
													var index = analyze.length;
													analyze[index] = {
														done : false
														,ajax: $.ajax({
															url		 :':analyze?'+node.url.replace(/#/g,'%23')
															,success :function(data){
																if( data.icon.length ) node.icon = data.icon;
															}
															,complete:function(){
																analyze[index].done = true;
															}
														})
													};
												}
											}
											return node;
										};
										// トップノードchildに登録('synced'は存在しない場合あり)
										bookmarks = bookmarks.roots;
										if( 'bookmark_bar' in bookmarks )
											root.child[0].child.push( chrome2node(bookmarks.bookmark_bar) );
										if( 'other' in bookmarks )
											root.child[0].child.push( chrome2node(bookmarks.other) );
										if( 'synced' in bookmarks )
											root.child[0].child.push( chrome2node(bookmarks.synced) );
										// プログレスバー
										work.progress( 1, analyze.length +1 );
										// favicon解析完了待ち
										(function(){
											var waiting=0;
											for( var i=0, n=analyze.length; i<n; i++ ){
												if( !analyze[i].done ) waiting++;
											}
											if( waiting ){
												work.progress( 1 +analyze.length -waiting, analyze.length +1 );
												setTimeout(arguments.callee,500);
												return;
											}
											// 完了
											if( !work.cancel ) importer( root );
										})();
									}
								});
							}
						});
					}
				});
			});
		}
		else $('#chromeico').hide();

		if( 'ie' in browser ){
			// IEお気に入りインポート
			$('#ieico').click(function(){
				Confirm({
					msg:'Internet Explorer お気に入りデータを取り込みます。#BR#データ量が多いと時間がかります。'
					,ok:function(){
						var work={
							ajax	 :null
							,cancel	 :false
							,analyze :[]
							,progress:Progress(function(){
								work.cancel = true;
								if( work.ajax ) work.ajax.abort();
								var analyze = work.analyze;
								for( var i=0; i<analyze.length; i++ ){
									analyze[i].ajax.abort();
									analyze[i].done = true;
								}
							})
						};
						work.ajax = $.ajax({
							url		:':favorites.json'
							//url		:':favorites.json?'	// ?をつけるとjsonが改行つき読みやすい
							,error	:function(xhr,text){ Alert("データ取得エラー:"+text); }
							,success:function(data){ analyzer( data, work ); }
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
						var work={
							ajax	 :null
							,cancel	 :false
							,analyze :[]
							,progress:Progress(function(){
								work.cancel = true;
								if( work.ajax ) work.ajax.abort();
								var analyze = work.analyze;
								for( var i=0; i<analyze.length; i++ ){
									analyze[i].ajax.abort();
									analyze[i].done = true;
								}
							})
						};
						work.ajax = $.ajax({
							url		:':firefox.json'
							//url		:':firefox.json?'	// ?をつけるとjsonが改行つき読みやすい
							,error	:function(xhr,text){ Alert("データ取得エラー:"+text); }
							,success:function(data){ analyzer( data, work ); }
						});
					}
				});
			});
		}
		else $('#firefoxico').hide();
	}
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
				var work={
					cancel	 :false
					,analyze :[]
					,progress:Progress(function(){
						work.cancel = true;
						var analyze = work.analyze;
						for( var i=0; i<analyze.length; i++ ){
							analyze[i].ajax.abort();
							analyze[i].done = true;
						}
					})
				};
				$impexp.find('iframe').off().one('load',function(){
					var jsonText = $(this).contents().text();
					if( jsonText.length ){
						//alert(jsonText);
						try{
							analyzer( $.parseJSON(jsonText), work );
						}
						catch( e ){
							Alert(e);
						}
					}
					$(this).empty();
					// 終わったらダイアログ閉じないとなぜか連続インポート＋差し替えが
					// 効かないとかファイル変更しても効かないとか挙動がおかしくなる。
					$impexp.dialog('destroy');
				});
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
		(function( child, depth ){
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
					arguments.callee( node.child, depth+1 );
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
		})( tree.top().child, 1 );
		html += '</DL><p>\n';
		// アップロード
		$.ajax({
			type	:'put'
			,url	:'export.html'
			,data	:html
			,error	:function(xhr,text){ Alert('データを保存できません:'+text); }
			,success:function(){
				// ダウンロード
				location.href ='http://'+location.host+'/export.html';
			}
		});
	});
	// ダイアログ表示
	$('#impexp').dialog({
		title		:'HTMLインポート・エクスポート'
		,modal		:true
		,width		:460
		,height		:320
		,close		:function(){ $(this).dialog('destroy'); }
	});
});
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
// favicon解析してから移行データ取り込み
function analyzer( data, work ){
	var analyze = work.analyze;
	(function( node ){
		if( node.child ){
			for( var i=0, n=node.child.length; i<n; i++ )
				arguments.callee( node.child[i] );
		}
		else if( node.url.length && !node.icon.length ){
			// favicon解析
			var index = analyze.length;
			analyze[index] = {
				done : false
				,ajax: $.ajax({
					url		 :':analyze?'+node.url.replace(/#/g,'%23')
					,success :function(data){
						if( data.icon.length ) node.icon = data.icon;
					}
					,complete:function(){
						analyze[index].done = true;
					}
				})
			};
		}
	})( data );
	// プログレスバー
	work.progress( 1, analyze.length +1 );
	// favicon解析完了待ち
	(function(){
		var waiting=0;
		for( var i=0, n=analyze.length; i<n; i++ ){
			if( !analyze[i].done ) waiting++;
		}
		if( waiting ){
			work.progress( 1 +analyze.length -waiting, analyze.length +1 );
			setTimeout(arguments.callee,500);
			return;
		}
		// 完了
		if( !work.cancel ) importer( data );
	})();
}
// 移行データ取り込み
function importer( data ){
	$('#dialog').html('現在のデータを破棄して、新しいデータに差し替えますか？<br>それとも追加登録しますか？')
	.dialog({
		title		:'データ取り込み方法の確認'
		,modal		:true
		,width		:410
		,height		:180
		,close		:function(){ $(this).dialog('destroy'); }
		,buttons	:{
			"差し替える":function(){
				$(this).dialog('destroy');
				option.panel.layout({}).panel.status({});
				paneler( tree.replace(data).top() );
			}
			,"追加登録する":function(){
				$(this).dialog('destroy');
				paneler( tree.mount(data.child[0]).top() );
			}
			,"キャンセル":function(){ $(this).dialog('destroy'); }
		}
	});
}
// jQuery UI Sortable
function setSortable(){
	// パネル
	$('.column').sortable({
		connectWith	:['.column']	// Drag&Dropできる範囲=columnクラス要素の中(の第一要素)を並べ替える
		,stop		:changeLayout	// 並べ替え終了直後に実行される関数
		,opacity	:0.4
		,distance	:9
	})
	.disableSelection();			// 必要なのか謎
	// アイテム
	// TODO:IE8うごかない…
	/*
	$('.itembox').sortable({
		connectWith	:['.itembox']
		,placeholder:'item-placeholder'
		,stop		:function(){
			// TODO:並べ替え結果保存
			// ドロップ先やドロップアイテム情報はどうやって取得するのか
			// ツリーノード変更してサーバーPUT
		}
		,opacity	:0.4
		,distance	:9
	})
	.disableSelection();
	*/
}
// パネルレイアウト(どのカラム=段にどのパネルが入っているか)保存
// 形式：JSON形式で、キーがカラム(段)ID、値がパネルIDの配列
//       { "co0": ["1","22","120","45"], "co1": ["3","5","89"], ... }
function changeLayout(){
	var layout = {};
	$('.panel').each(function(){
		var id = { column:this.parentNode.id, panel:this.id };
		if( !(id.column in layout) ) layout[id.column] = [];
		layout[id.column].push( id.panel );
	});
	if( JSON.stringify(option.panel.layout()) !=JSON.stringify(layout) )
		option.panel.layout( layout );
}
// パネル開閉状態の保存と復活
// 形式: JSON形式で、キーがボタンID、値が 0(開) または 1(閉)
//       { "btn1":1, "btn9":0, "btn45":0, ... }
function changeStatus(){
	var status = {};
	$('.plusminus').each(function(){
		//srcはURL('http://localhost:XXX/plus.png'など)文字列
		status[this.id] = (this.src.match(/\/plus.png$/))? 1 : 0;
	});
	option.panel.status( status );
}
// パラメータ変更反映
function playLocalParam(){
	var font_size = option.font.size();
	var panel_width = option.panel.width();
	var panel_margin = option.panel.margin();
	var column_width = panel_width +panel_margin +2;	// +2 適当たぶんボーダーぶん
	$wall.width( column_width *option.column.count() ).css({
		'padding-right': panel_margin +'px'
	})
	.find('.column').width( column_width )
	.find('.panel').width( panel_width ).css({
		'font-size': font_size +'px'
		,'margin': panel_margin +'px 0 0 ' +panel_margin +'px'
	})
	.find('#newurl').css('font-size',font_size);
	// ドラッグ先領域CSS更新
	// TODO:毎回追加するだけして消してないけどいいかな・・おそらくブラウザの保持データが増えていく
	// ので注意が必要だが、パネル設定を変更した時だけだからだいじょうぶかな・・
	$.css.add('.ui-sortable-placeholder{margin:' +panel_margin +'px 0 0 ' +panel_margin +'px;}');
}
// カラム数変更
function changeColumnCount( count ){
	if( count.prev < count.next ){
		// カラム増える
		var width = $('#co0').width();		// 1列目(co0)と同じ幅
		var $br = $wall.children('br');		// 最後の<br class=clear>
		for( var i=count.prev; i<count.next; i++ ){
			$br.before( $('<div id=co'+i+' class=column></div>').width( width ) );
		}
		setSortable();
	}
	else if( count.prev > count.next ){
		// カラム減る
		var $column = [];						// カラムオブジェクト配列
		for( var i=0; i<count.prev; i++ ){
			$column[i] = $('#co'+i);
		}
		// 消えるカラムにあるパネルを残るカラムに分配
		var distination=0;
		for( var i=count.next; i<count.prev; i++ ){
			$column[i].find('.panel').each(function(){
				$(this).appendTo( $column[distination%count.next] );
				distination++;
			});
			// 分配おわりカラムDOMエレメント削除
			$column[i].remove();
		}
		setSortable();
	}
}
// 確認ダイアログ
// IE8でなぜか改行コード(\n)の<br>置換(replace)が効かないので、しょうがなく #BR# という
// 独自改行コードを導入。Chrome/Firefoxは単純に \n でうまくいくのにIE8だけまた・・
function Confirm( arg ){
	if( arguments.length ){
		var opt ={
			title		:arg.title ||'確認'
			,modal		:true
			,width		:365
			,height		:185
			,close		:function(){ $(this).dialog('destroy'); }
			,buttons	:{}
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

		$('#dialog').html( HTMLtext( arg.msg ).replace(/#BR#/g,'<br>') ).dialog( opt );
	}
}
// 警告ダイアログ
function Alert( msg ){
	if( arguments.length ){
		var opt ={
			title		:'通知'
			,modal		:true
			,width		:360
			,height		:160
			,close		:function(){ $(this).dialog('destroy'); }
			,buttons	:{ 'O K':function(){ $(this).dialog('destroy'); } }
		};
		$('#dialog').html( HTMLtext( ''+msg ).replace(/#BR#/g,'<br>') ).dialog( opt );
	}
}
// 進捗ダイアログ
function Progress( cancel ){
	if( arguments.length ){
		var $pgbar = $('<div></div>');
		var $count = $('<span></span>');
		$('#dialog').empty().text('処理中です...').append($count).append('<br>').append($pgbar)
		.dialog({
			title		:'情報'
			,modal		:true
			,width		:400
			,height		:190
			,close		:function(){ cancel(); $(this).dialog('destroy'); }
			,buttons	:{
				"キャンセル":function(){ cancel(); $(this).dialog('destroy'); }
			}
		});
		$pgbar.progressbar();
		return function( count, max ){
			$count.text('('+count+'/'+max+')');
			$pgbar.progressbar('value',count*100/max);
		}
	}
}
// サイトのタイトルに含まれる文字参照(&#39;とか)をデコードする。
// 通常はないがもしタイトルにタグや<script>が含まれている場合、そのまま
// jQuery.html().text()すると<script>が消えてしまうので、あらかじめ <>
// は文字参照にエンコードして渡す。テストサイトでタイトルに<h1>,<script>
// &,&amp;などを入れて動作確認。
function HTMLtext( s ){
	return $('<a/>').html(
		s.replace(/[<>]/g,function(m){
			return { '<':'&lt;', '>':'&gt;' }[m];
		})
	).text();
}
/*
// ChromeでPUTが動かないことがあったので調査のための$.ajax({})ラッパ。しかし詳細判明せず…。
function ajax( opt ){
	opt.type = opt.type || 'get';
	opt.url = opt.url || '/';
	opt.data = opt.data || '';
	opt.async = opt.async || true;
	opt.success = opt.success || function(){};
	opt.error = opt.error || function(){};
	opt.complete = opt.complete || function(){};
	var req = function(){
		if( IE ){
			try {
				return new ActiveXObject('Msxml2.XMLHTTP');
			}
			catch( e ){
				return new ActiveXObject('Microsoft.XMLHTTP');
			}
		}
		else{
			return new XMLHttpRequest();
		}
	}();
	req.onreadystatechange = function(){
		switch( req.readyState ){
		case 1: // Open
			break;
		case 2: // Sent
			break;
		case 3: // Receiving
			break;
		case 4: // Loaded
			switch( req.status.toString().charAt(0) ){
			case '2':
			case '3':
				$debug[0].innerHTML += 'ajax success.';
				var ct = req.getResponseHeader('Content-Type');
				if( ct ){
					if( ct.match(/application\/jsonp/) )
						opt.success( req.responseText );
					else if( ct.match(/application\/json/) )
						opt.success( $.parseJSON(req.responseText) );
				}
				else{
					opt.success( req.responseText );
				}
				break;
			case '4':
			case '5':
			default: // 404にはならず0になるようだ…
				$debug[0].innerHTML += 'ajax error.';
				opt.error( req, req.statusText );
			}
			opt.complete();
		}
	};
	req.open( opt.type, opt.url, opt.async );
	req.send( opt.data );
}
*/

})($);
