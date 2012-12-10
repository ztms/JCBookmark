// vim:set ts=4:vim modeline
(function($){
/*
var $debug = $('<div></div>').css({
	position:'fixed'
	,left:'0'
	,top:'0'
	,width:'100px'
	,background:'#fff'
	,border:'1px solid #000'
	,padding:'0'
}).appendTo(document.body);
*/
var IE = window.ActiveXObject ? document.documentMode :0; //$debug.text('IE='+IE);
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
			if( on ) $('#modified').css('display','inline-block');
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
		}( tree.root );
	}
	// 指定ノードIDの親ノードオブジェクト
	,nodeParent:function( id ){
		return function( node ){
			for( var i=0; i<node.child.length; i++ ){
				if( node.child[i].id==id ){
					// 見つけた
					return node;
				}
				if( node.child[i].child ){
					var found = arguments.callee( node.child[i] );
					if( found ) return found;
				}
			}
			return null;
		}( tree.root );
	}
	// ノードAの子孫にノードBが存在したらtrueを返す
	// A,BはノードIDまたはノードオブジェクトどちらでも
	,nodeAhasB:function( A, B ){
		if( isString(A) ) A = tree.node(A);
		if( A && A.child ){
			return function( child ){
				for( var i=0, n=child.length; i<n; i++ ){
					// TODO:BがID文字列だった場合とノードオブジェクトだった場合
					// この判定方法でいいのかな…？
					if( child[i].id==B || child[i]===B )
						return true;
					if( child[i].child ){
						if( arguments.callee( child[i].child ) )
							return true;
					}
				}
				return false;
			}( A.child );
		}
		return false;
	}
	// 指定ノードIDがごみ箱にあるかどうか
	,trashHas:function( id ){ return tree.nodeAhasB( tree.trash(), id ); }
	// 新規フォルダ作成
	,newFolder:function( pid, title ){
		var node = {
			id			:tree.root.nextid++
			,dateAdded	:(new Date()).getTime()
			,title		:title || '新規フォルダ'
			,child		:[]
		};
		// 引数IDのchild先頭に追加する
		( tree.node(pid) || tree.top() ).child.unshift( node );
		tree.modified(true);
		return node;
	}
	// 新規ブックマーク作成
	,newURL:function( pid, url, title, icon ){
		var node = {
			id			:tree.root.nextid++
			,dateAdded	:(new Date()).getTime()
			,title		:title || '新規ブックマーク'
			,url		:url || ''
			,icon		:icon || ''
		};
		// 引数IDのchild先頭に追加する
		( tree.node(pid) || tree.top() ).child.unshift( node );
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
	,path:'tree.json'
	// ノードツリー取得
	,load:function( onSuccess ){
		$.ajax({
			url:tree.path
			,beforeSend:function(xhr){
				// IEキャッシュ対策 http://d.hatena.ne.jp/hasegawayosuke/20090925/p1
				xhr.setRequestHeader('If-Modified-Since','Thu, 01 Jun 1970 00:00:00 GMT');
			}
			,error:function(xhr,text){ Alert('データ取得できません:'+text); }
			,success:function(data){
				tree.replace( data );
				if( onSuccess ) onSuccess();
			}
		});
	}
	// ノードツリー保存
	,save:function( onSuccess ){
		$.ajax({
			type	:'put'
			,url	:tree.path
			,data	:JSON.stringify(tree.root)
			,error	:function(xhr,text){ Alert('保存できませんでした:'+text); }
			,success:function(){
				tree.modified(false);
				if( onSuccess ) onSuccess();
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
			(function( child ){
				for( var i=0; i<child.length; i++ ){
					if( child[i].id==id ){
						// 見つけた消去
						child.splice(i,1);
						tree.modified(true);
						return true;
					}
					if( child[i].child ){
						if( arguments.callee( child[i].child ) )
							return true;
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
			//Alert(ids.toString());
			var count=0;
			(function( child ){
				for( var i=0; i<child.length; i++ ){
					if( ids.length && child[i].child ){
						arguments.callee( child[i].child );
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
				//Alert(count+'個のノードを削除');
				tree.modified(true);
				return true;
			}
		}
		return false;
	}
	// ノード移動(childに)
	// ids:ノードID配列、dst:フォルダノードIDまたはノードオブジェクト
	,moveChild:function( ids, dst ){
		if( isString(dst) ) dst = tree.node( dst );
		if( dst && dst.child ){
			// 移動元ノード検査：移動元と移動先が同じ、移動不可ノード、移動元の子孫に移動先が存在したら除外
			for( var i=0; i<ids.length; i++ ){
				if( ids[i]==dst.id || !tree.movable(ids[i]) || tree.nodeAhasB(ids[i],dst) )
					ids.splice(i--,1);
			}
			if( ids.length ){
				// 切り取り
				var clipboard = [];
				(function( child ){
					for( var i=0; i<child.length; i++ ){
						if( ids.length && child[i].child ){
							arguments.callee( child[i].child );
						}
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
		for( var i=0; i<ids.length; i++ ){
			if( ids[i]==dstid || !tree.movable(ids[i]) || tree.nodeAhasB(ids[i],dstid) )
				ids.splice(i--,1);
		}
		if( ids.length ){
			// 移動先の親ノード
			var dstParent = tree.nodeParent( dstid );
			if( dstParent ){
				// 移動元ノード抜き出し
				var movenodes = [];
				(function( child ){
					for( var i=0; i<child.length; i++ ){
						if( ids.length && child[i].child ){
							arguments.callee( child[i].child );
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
								// 後に逆順に挿入
								if( i==dstParent.child.length-1 ){
									for( var j=movenodes.length-1; j>=0; j-- )
										dstParent.child.push(movenodes[j]);
								}else{
									i++;
									for( var j=movenodes.length-1; j>=0; j-- )
										dstParent.child.splice(i,0, movenodes[j]);
								}
							}else{
								// 前に逆順に挿入
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

// 独自フォーマット時刻文字列
Date.prototype.myFmt = function(){
	// 0=1970/1/1は空
	var diff = this.getTime();
	if( diff <1 ) return '';
	// YYYY/MM/DD HH:MM:SS
	var Y = this.getFullYear();
	var M = this.getMonth() +1;
	var D = this.getDate();
	var h = this.getHours();
	var m = this.getMinutes();
	var s = this.getSeconds();
	var date = ((M<10)?'0'+M:M) +'/' +((D<10)?'0'+D:D);
	var time = ((h<10)?'0'+h:h) +':' +((m<10)?'0'+m:m) +':' +((s<10)?'0'+s:s);
	// 現在時刻との差分
	diff = ~~(((new Date()).getTime() - diff) /1000);
	if( diff <=10 ) return 'いまさっき (' +time +')';
	if( diff <=60 ) return '1分以内 (' +time +')';
	if( diff <=3600 ) return ~~(diff /60) +'分前 (' +time +')';
	if( diff <=3600*1.5 ) return '1時間前 (' +time +')';
	if( diff <=3600*24 ) return Math.round(diff /3600) +'時間前 (' +date +' ' +time +')';
	if( diff <=3600*24*30 ) return Math.round(diff /3600 /24) +'日前 (' +date +' ' +time +')';
	return Y +'/' +date +' ' +time;
}

$(window).on('resize',function(){
	$('#editbox').trigger('decide');
	var window_width = $(window).width() -1; // 適当-1px
	var folderbox_width = ~~(window_width /5.3);
	var folderbox_height = $(window).height() -$('#toolbar').height() -1;		// borderぶん適当-1px
	var itembox_width = window_width -folderbox_width -$('#border').width() -2;	// borderぶん適当-2px
	var items_width = ((itembox_width <400)? 400 : itembox_width) -17;			// スクロールバー17px
	var title_width = ~~(items_width /3);										// 割合適当
	var url_width = ~~((items_width -title_width) /2.5);						// 割合適当
	var icon_width = ~~((items_width -title_width -url_width) /1.8);			// 割合適当
	var date_width = items_width -title_width -url_width -icon_width;

	$('#toolbar') // #modifiedがfloatで下にいかないよう1040px以上必要
		.width( (window_width <1040)? 1040 : window_width );
	$('#folderbox')
		.width( folderbox_width )
		.height( folderbox_height );
	$('#border')
		.height( folderbox_height );
	$('#itembox')
		.width( itembox_width )
		.height( folderbox_height );
	// アイテムヘッダのボーダーと合うよう適当に増減して設定
	$('#itemhead')
		.width( items_width )
		.find('.title').width( title_width ).end()
		.find('.url').width( url_width ).end()
		.find('.iconurl').width( icon_width ).end()
		.find('.date').width( date_width -38 );					// -38px適当float対策
	$('#items')
		.width( items_width )
		.find('.title').width( title_width -18 ).end()				// アイコンのぶん-18px
		.find('.url').width( url_width +4 ).end()					// itemborderのぶん-4px
		.find('.iconurl').width( icon_width +4 ).end()				// itemborderのぶん-4px
		.find('.summary').width( url_width +icon_width +14 ).end()	// 見た目で合うように+14px
		.find('.date').width( date_width -36);					// float対策適当-36px
});

$(document).on({
	mousedown:function(ev){
		// 右クリックメニュー隠す
		if( !$(ev.target).is('#contextmenu,#contextmenu *') ){
			$('#contextmenu').hide().find('a').off();
		}
		// inputタグはフォーカスするためtrue返す
		if( $(ev.target).is('input, .barbtn') ){
			return true;
		}
		// (WK,GK)既定アクション停止
		return false;
	}
	// キーボードショートカット
	,keydown:function( ev ){
		switch( ev.which || ev.keyCode || ev.charCode ){
		case 27: // Esc
			$('#exit').click(); return false;
		case 46: // Delete
			if( !$(ev.target).is('input') ){
				$('#delete').click();
				return false;
			}
		}
	}
	// テキスト選択キャンセル
	,selectstart:function(ev){
		if( $(ev.target).is('input') ){
			return true;
		}
		return false;
	}
});
if( IE && IE<9 ){
	// IE8ウィンドウ外ドラッグのよい解決策がないので、
	// ウィンドウ外に出たらドラッグやめたことにする。
	$(document).mouseleave(function(){ $(this).mouseup(); } );
}

// 終了
$('#exit').click(function(){
	if( tree.modified() ){
		Confirm({
			msg :'変更が保存されていません。保存しますか？'
			,yes:function(){ tree.save( reload ); }
			,no :function(){ reload(); }
		});
	}
	else reload();

	function reload(){ location.href ='http://'+location.host; }
});
// 保存
$('#save').click(function(){ tree.save(function(){$('#modified').hide();}); });
// 新規フォルダ
$('#newfolder').click(function(){
	var fid = selectFolder.id;
	var name = $('#newname').val();
	// 選択フォルダID=folderXXならノードID=XX
	var node = tree.newFolder( fid.slice(6), name );
	// フォルダツリー生成
	folderTree();
	// フォルダ選択
	$('#'+fid).click();
	// アイテム選択ノードID=XXXならアイテムボックスID=itemXXX
	var $item = $('#item'+node.id);
	// $item.mousedown().mouseup();と書きたいところだが、
	// IE8はmousedown()でエラー発生する仕様なのが影響してか、
	// mouseup()およびその先の処理も実行されないもよう。
	// 仕方がないのでsetTimeoutを使う。
	setTimeout(function(){ $item.mousedown(); }, 0 );
	setTimeout(function(){
		$item.mouseup();
		if( !name.length ){
			// 名前変更
			edit( $item.children('.title')[0] );
			// テキスト全選択
			$('#editbox').select();
		}
	}, 1 );
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
	setTimeout(function(){ $item.mousedown(); }, 0 );
	setTimeout(function(){
		$item.mouseup();
		if( url.length ){
			$.get(':analyze?'+url.replace(/#/g,'%23'),function(data){
				if( data.title.length ){
					data.title = HTMLtext( data.title );
					if( tree.nodeAttr( node.id, 'title', data.title ) >1 )
						$('#item'+node.id).find('.title').text( data.title );
				}
				if( data.icon.length ){
					if( tree.nodeAttr( node.id, 'icon', data.icon ) >1 )
						$('#item'+node.id).find('img').attr('src',data.icon).end().find('.iconurl').text(data.icon);
				}
			});
		}else{
			// URL変更
			edit( $item.children('.url')[0] );
			// テキスト全選択
			$('#editbox').select();
		}
	}, 1 );
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
	if( select.id.match(/^item/) ){
		// アイテム欄
		var titles='', count=0, ids=[];
		$('#items').children().each(function(){
			if( $(this).hasClass('select') ){
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
					,height	:count *19 +180
					,ok:function(){
						// ノードツリー変更
						tree.eraseNodes( ids );
						// 表示更新
						var fid = selectFolder.id;
						folderTree();
						$('#'+fid).click();
					}
				});
			}
			else{
				tree.moveChild( ids, tree.trash() );
				var fid = selectFolder.id;
				folderTree();
				$('#'+fid).click();
			}
		}
	}
	else{
		// フォルダツリー
		var fid = select.id.slice(6);
		if( tree.movable(fid) ){
			if( tree.trashHas(fid) ){
				Confirm({
					msg		:'フォルダ「' +$('.title',select).text() +'」を完全に消去します。'
					,width	:400
					,height	:180
					,ok:function(){
						tree.eraseNode( fid );
						$( folderTree()[0].childNodes[0] ).click();
					}
				});
			}
			else{
				tree.moveChild( [fid], tree.trash() );
				$( folderTree()[0].childNodes[0] ).click();
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
	var $border = $(this);
	var $folderbox = $('#folderbox');
	var $itembox = $('#itembox');
	var folderbox_width = $folderbox.width();
	var itembox_width = $itembox.width();
	var downX = ev.pageX;
	$(document).on('mousemove.border',function(ev){
		var dx = ev.pageX -downX;
		var folderbox_width_new = folderbox_width +dx;
		var itembox_width_new = itembox_width -dx;
		if( folderbox_width_new >20 && itembox_width_new >20 ){
			$folderbox.width( folderbox_width_new );
			$itembox.width( itembox_width_new );
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
	var attrhead_width = $attrhead.width();
	var lasthead_width = $lasthead.width();
	var attr_width = $attr.length? $attr.width() : 0;
	var smry_width = $smry.length? $smry.width() : 0;
	var last_width = $last.length? $last.width() : 0;
	var downX = ev.pageX;
	$(document).on('mousemove.itemborder',function(ev){
		var dx = ev.pageX - downX;
		var attrhead_width_new = attrhead_width + dx;
		var lasthead_width_new = lasthead_width - dx;
		var attr_width_new = attr_width + dx;
		var smry_width_new = smry_width + dx;
		var last_width_new = last_width - dx;
		if( attrhead_width_new >20 && lasthead_width_new >20 ){
			$attrhead.width( attrhead_width_new );
			$lasthead.width( lasthead_width_new );
			if( attr_width ) $attr.width( attr_width_new );
			if( smry_width ) $smry.width( smry_width_new );
			if( last_width ) $last.width( last_width_new );
		}
	})
	.one('mouseup',function(){
		$(document).off('mousemove.itemborder');
		// TODO:位置保存する…？
	});
});
// アイテム欄でマウス矩形選択
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
		// 変更を反映
		$('#editbox').trigger('decide');
		// 矩形表示
		$('#selectbox').css({ left:downX, top:downY, width:1, height:1 }).show();
		// 選択フォルダ非アクティブ
		$(selectFolder).addClass('inactive');
		// ドラッグ選択イベント
		$items = $items.children();
		$(document).on('mousemove.selectbox',function(ev){
			// 矩形表示
			var rect = $.extend(
				(ev.pageX > downX)? { left:downX, width:ev.pageX -downX } :{ left:ev.pageX, width:downX -ev.pageX },
				(ev.pageY > downY)? { top:downY, height:ev.pageY -downY } :{ top:ev.pageY, height:downY -ev.pageY }
			);
			$('#selectbox').css( rect );
			// 矩形内アイテム選択
			selectItemClear();
			$items.each(function(){
				offset = $(this).removeClass('inactive').offset();
				if( offset.top >= rect.top-10 ) $(select=selectItemLast=this).addClass('select').focus();
			});
		})
		.one('mouseup',function(){
			$(document).off('mousemove.selectbox');
			$('#selectbox').hide();
		});
	}
});
// 開始
tree.load(function(){
	$(window).resize();
	$('#toolbar,#folderbox,#border,#itembox').show();
	$( folderTree()[0].childNodes[0] ).click();
});

function folderTree(){
	// フォルダツリー生成
	// TODO:フォルダの左側にプラスマイナスボタンほしい
	// 表示/非表示の切り替えより、要素の追加/削除のほうが楽かな？
	var $folders = $('#folders').empty();
	var $folder = function(){
		var $e = $('<div class=folder tabindex=0><img class=icon><span class=title></span><br class=clear></div>')
			.on({
				click		:folderClick
				,selfclick	:itemSelfClick
				,mousedown	:folderMouseDown
				,mousemove	:itemMouseMove
				,mouseup	:itemMouseUp
				,mouseleave	:itemMouseLeave
				,keydown	:folderKeyDown
				,contextmenu:folderContextMenu
			});
		return function( id, title, icon, depth ){
			return $e.clone(true)
				.attr('id', 'folder' +id)
				.css('padding-left', depth *16 +'px')
				.find('img').attr('src', icon).end()
				.find('span').text( title ).end();
		};
	}();
	(function( node, depth ){
		$folders.append( $folder(node.id, node.title, 'folder.png', depth) );
		// 子フォルダ
		for( var i=0, n=node.child.length; i<n; i++ ){
			if( node.child[i].child )
				arguments.callee( node.child[i], depth +1 );
		}
	})( tree.top(), 0 );
	// ごみ箱
	// TODO:最初はごみ箱はプラスボタンで中のフォルダ見えなくていい
	// 表示/非表示の切り替えより、要素の追加/削除のほうが楽かな？
	$folders.append( $folder(tree.trash().id, tree.trash().title, 'trash.png', 0) );
	(function( child, depth ){
		for( var i=0, n=child.length; i<n; i++ ){
			if( child[i].child ){
				$folders.append( $folder(child[i].id, child[i].title, 'folder.png', depth) );
				arguments.callee( child[i].child, depth +1 );
			}
		}
	})( tree.trash().child, 1 );
	// #foldersの幅を設定する。
	// しないと横スクロールバーが必要な時に幅が狭くなり表示崩れる。
	var maxWidth = 0;
	$folders.find('.title').each(function(){
		var width = this.offsetLeft + ~~($(this).width() *1.3);
		if( width > maxWidth ) maxWidth = width;
	}).end()
	.width( maxWidth );
	return $folders;
}

function folderClick(ev){
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
			// クリックフォルダ選択状態にする
			$(selectFolder).removeClass('select inactive');
			$(select=selectFolder=this).addClass('select').focus();
			// コンテンツにアイテム(child配列)登録
			var $item = function(){
				var $e = $('<div class=item tabindex=0><img class=icon></div>').on({
					mousedown	:itemMouseDown
					,mousemove	:itemMouseMove
					,mouseup	:itemMouseUp
					,mouseleave	:itemMouseLeave
					,click		:itemClick
					,dblclick	:itemDblClick
					,selfclick	:itemSelfClick
					,keydown	:itemKeyDown
					,keypress	:itemKeyPress
					,contextmenu:itemContextMenu
				},{
					itemID		:''
					,itemNotify	:''
				});
				var $head = $('#itemhead');
				var url_width = $head.find('.url').width() +4;
				var icon_width = $head.find('.iconurl').width() +4;
				var $title = $('<span class=title></span>').width( $head.find('.title').width() -18 );
				var $url = $('<span class=url></span>').width( url_width );
				var $icon = $('<span class=iconurl></span>').width( icon_width );
				var $smry = $('<span class=summary></span>').width( url_width +icon_width +6 );
				var $date = $('<span class=date></span>').width( $head.find('.date').width() +2 );
				var $br = $('<br class=clear>');
				var $fol = $e.clone(true)
					.addClass('folder')
					.find('img').attr('src','folder.png').end()
					.append( $title.clone() )
					.append( $smry )
					.append( $date.clone() )
					.append( $br.clone() );
				var $url = $e
					.append( $title )
					.append( $url )
					.append( $icon )
					.append( $date )
					.append( $br );
				var date = new Date();
				return function( node ){
					date.setTime( node.dateAdded||0 );
					if( node.child )
						return $fol.clone(true)
							.attr('id', 'item' +node.id)
							.find('.title').text( node.title ).end()
							.find('.summary').text(function(){
								for(var smry='',i=0,n=node.child.length; i<n; i++) smry+='.';
								return smry;
							}()).end()
							.find('.date').text( date.myFmt() ).end();
					else
						return $url.clone(true)
							.attr('id', 'item' +node.id)
							.find('img').attr('src', node.icon ||'item.png').end()
							.find('.title').text( node.title ).attr('title', node.title).end()
							.find('.url').text( node.url ).end()
							.find('.iconurl').text( node.icon ).end()
							.find('.date').text( date.myFmt() ).end();
				};
			}();
			var $items = $('#items').empty();
			selectItemClear();
			for( var i=0, n=node.child.length; i<n; i++ ){
				var $e = $item( node.child[i] );
				// 1行毎色分け
				if( i%2 ) $e.addClass('bgcolor');
				$items.append( $e );
			}
		}
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
		}else{
			// なにも選択されてないので単選択
			$(select=selectItemLast=this).addClass('select').focus();
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
		}
	}else{
		// 単選択(差し替え)
		if( $(this).hasClass('select') ){
			$(select=selectItemLast=this).focus();
			// 選択済みアイテムの数
			var selectCount = function(children){
				var count = 0;
				for( var i=0, n=children.length; i<n; i++ ){
					if( $(children[i]).hasClass('select') ) count++;
				}
				return count;
			}( $('#items').children() );
			// 複数選択されていた場合、mouseup(click)で単選択に差し替え。
			// (ここで選択解除するとドラッグできなくなるダメ)
			// 単選択だった場合、mouseup(click)で名前変更。
			ev.data.itemNotify = ( selectCount >1 )? 'select1' :'edit';
		}else{
			// 未選択はここで差し替え単選択
			selectItemClear();
			$(select=selectItemLast=this).addClass('select').focus();
		}
	}
	// ドラッグ開始
	itemDragStart( this, ev.pageX, ev.pageY );
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
	var folder_top = {
		X0	:folderbox.offsetLeft
		,Y0	:folderbox.offsetTop
		,X1	:folderbox.offsetLeft +folderbox.clientWidth
		,Y1	:folderbox.offsetTop +36
	};
	// フォルダ欄下領域
	var folder_bottom = {
		X0	:folderbox.offsetLeft
		,Y0	:folderbox.offsetTop +folderbox.clientHeight -36
		,X1	:folderbox.offsetLeft +folderbox.clientWidth
		,Y1	:folderbox.offsetTop +folderbox.clientHeight
	};
	// アイテム欄上領域
	var item_top = {
		X0	:itembox.offsetLeft
		,Y0	:itembox.offsetTop
		,X1	:itembox.offsetLeft +itembox.clientWidth
		,Y1	:itembox.offsetTop +36
	};
	// アイテム欄下領域
	var item_bottom = {
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
	$(document).on('mousemove.itemdrag1',function(ev){
		if( (Math.abs(ev.pageX-downX) +Math.abs(ev.pageY-downY)) >3 ){
			// ある程度カーソル移動したらドラッグ開始
			draggie = element;
			// ドラッグ中スタイル適用
			if( draggie.id.match(/^item/) ){
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
				dragitem = { ids:[ draggie.id.slice(6) ] };
			}
			// ドラッグボックス表示
			// <img>タグは$('img',draggie).html()で取れないの？
			$('#dragbox').empty().text( $('.title',draggie).text() )
			.prepend( $('<img class=icon>').attr('src', $('img',draggie).attr('src')) )
			.css({ left:ev.pageX+5, top:ev.pageY+5 }).show();
			// イベント再登録
			$(document).off('mousemove.itemdrag1').on('mousemove.itemdrag2',function(ev){
				// ドラッグボックス移動
				$('#dragbox').css({ left:ev.pageX+5, top:ev.pageY+5 });
				// ドラッグ中に上端/下端に近づいたらスクロールさせる
				if( ev.pageX >=folder_top.X0 && ev.pageX <=folder_top.X1 ){
					if( ev.pageY >=folder_top.Y0 && ev.pageY <=folder_top.Y1 ){
						//$debug.text('フォルダ欄で上スクロール');
						if( !scrolling ) scrolling = setInterval(function(){scroller(folderbox,-30);},100);
					}
					else if( ev.pageY >=folder_bottom.Y0 && ev.pageY <=folder_bottom.Y1 ){
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
				else if( ev.pageX >=item_top.X0 && ev.pageX <= item_top.X1 ){
					if( ev.pageY >=item_top.Y0 && ev.pageY <=item_top.Y1 ){
						//$debug.text('アイテム欄で上スクロール');
						if( !scrolling ) scrolling = setInterval(function(){scroller(itembox,-30);},100);
					}
					else if( ev.pageY >=item_bottom.Y0 && ev.pageY <=item_bottom.Y1 ){
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
		$(document).off('mousemove.itemdrag1 mousemove.itemdrag2');
		// ドラッグ解除
		$('#dragbox').hide();
		if( draggie ){
			if( draggie.id.match(/^item/) ){
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
		if( draggie.id.match(/^item/) && this.id.match(/^item/) && $this.hasClass('select') ) return;
		// ドロップ要素スタイル適用
		$this.removeClass('dropTop dropBottom dropIN');
		// エレメント上端からマウスの距離 Y は 0～22くらいの範囲
		var Y = ev.pageY - $this.offset().top;
		if( draggie.id.match(/^item/) ){
			// アイテム欄から…
			if( dragitem.itemcount ){
				// アイテム(ブックマーク)を含む単選択か複数選択を…
				if( this.id.match(/^item/) ){
					// アイテム欄の…
					if( $this.hasClass('folder') ) SiblingAndChild(); // フォルダへドラッグ
					else SiblingOnly(); // アイテムへドラッグ
				}else{
					// フォルダツリーへドラッグ
					ChildOnly();
				}
			}else if( dragitem.foldercount ){
				// フォルダのみを…
				if( this.id.match(/^item/) ){
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
			if( this.id.match(/^item/) ){
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
		if( Y <=7 )
			$this.addClass('dropTop');
		else if( Y >=17 )
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
		if( draggie.id.match(/^item/) && this.id.match(/^item/) && $this.hasClass('select') ) return;
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
		var fid = selectFolder.id;
		folderTree();
		$('#'+fid).click();
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

function itemContextMenu(ev){
	var item = ev.target.parentNode;
	while( !item.id.match(/^item/) ){
		if( !item.parentNode ) break;
		item = item.parentNode;
	}
	var $menu = $('#contextmenu').find('a').off().end();
	// 開く
	if( $(item).find('.summary').length ){
		// フォルダ
		$menu.find('#itemopen').addClass('enable')
		.text('フォルダを開く')
		.on('click',function(){
			$menu.hide();
			$(item).dblclick();
		});
	}
	else{
		// ブックマーク
		var url = $(item).find('.url').text();
		if( url.length ){
			$menu.find('#itemopen').addClass('enable')
			.text('URLを開く')
			.on('click',function(){
				$menu.hide();
				window.open( url );
			});
		}
		else $menu.find('#itemopen').removeClass('enable');
	}
	// 削除
	$menu.find('#itemdelete').addClass('enable').on('click',function(){
		$menu.hide();
		$('#delete').click();
	}).end()
	// 表示
	.css({
		left: (($(window).width() -ev.pageX) <$menu.width())? ev.pageX -$menu.width() : ev.pageX
		,top: (($(window).height() -ev.pageY) <$menu.height())? ev.pageY -$menu.height() : ev.pageY
	}).show();
	return false;	// 既定右クリックメニュー出さない
}

// TODO:フォルダ右クリックメニュー
// TODO:ごみ箱には「ごみ箱を空にする」
function folderContextMenu(ev){
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
function edit( element ){
	if( element ){
		switch( element.className ){
		case 'title':
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
				var isFolderTree = element.parentNode.id.match(/^folder/);
				$('#editbox').css({
					left			:offset.left -1
					,top			:offset.top -1
					,width			:isFolderTree? $('#folders').width() -element.offsetLeft : element.offsetWidth -1
					,'padding-left'	:$e.css('padding-left')
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
								if( $(element.parentNode).hasClass('item folder') ) folderTree();
								break;
							case 'url':
								if( value.length ){
									// 新品アイテムかファビコン無しの場合はURLを取得解析する
									var node = tree.node( nodeid );
									if( node.title=='新規ブックマーク' || !node.icon || !node.icon.length ){
										$.get(':analyze?'+value.replace(/#/g,'%23'),function(data){
											if( data.title.length && node.title=='新規ブックマーク' ){
												data.title = HTMLtext( data.title );
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
								var needWidth = element.offsetLeft + ~~($e.width() *1.3);
								if( needWidth > foldersWidth ) $('#folders').width( needWidth );
							}
						}
						// 終了隠す
						$(element.parentNode).focus();
						$(this).off().hide();
					}
					// TAB,Enterで反映
					,keydown:function( ev ){
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
			}, 10 );
			break;
		case 'date':
			// 作成日時は変更禁止、値コピーのためボックス表示。
			setTimeout(function(){
				var $e = $(element);
				var offset = $e.offset();
				$('#editbox').css({
					left			:offset.left -1
					,top			:offset.top -1
					,width			:element.offsetWidth -1
					,'padding-left'	:$e.css('padding-left')
				})
				.val( $e.text() )
				.on({
					// なにもしない消えるだけ
					decide:function(){
						$(element.parentNode).focus();
						$(this).off().hide();
					}
					// TAB
					,keydown:function( ev ){
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
			}, 10 );
			break;
		}
	}
}

// element全体見えるようスクロール
function viewScroll( element ){
	// スクロール対象ボックス確認
	var boxid = element.parentNode.id;
	if( boxid.match(/^item/) ) boxid = 'items';
	else if( boxid.match(/^folder/) ) boxid = 'folders';
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
	if( arguments.length ){
		var opt ={
			title		:arg.title ||'確認'
			,modal		:true
			,resizable	:false
			,width		:365
			,height		:180
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

		$('#dialog').html( HTMLtext( arg.msg ).replace(/#BR#/g,'<br>') ).dialog( opt );
	}
}
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
		$('#dialog').html( HTMLtext( msg ).replace(/#BR#/g,'<br>') ).dialog( opt );
	}
}

// HTMLエスケープ:$('<a/>').html().text()だと<script>が消えてしまうため自作。
function HTMLtext( s ){
	return $('<a/>').html(
		s.replace(/[<>]/g,function(m){
			return { '<':'&lt;', '>':'&gt;' }[m];
		})
	).text();
}
// 引数が文字列かどうか判定
function isString( s ){
	return (Object.prototype.toString.call(s)==='[object String]');
}

})($);
