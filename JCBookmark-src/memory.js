//
// memory.pl の JScript 版
// >cscript //nologo memory.js
//
var log = WScript.ScriptFullName.replace(WScript.ScriptName,'..\\JCBookmark\\memory.log');
var fs = new ActiveXObject('Scripting.FileSystemObject');
var fp = fs.OpenTextFile( log, 1, false );
try{
	var allocs = [];	// allocアドレス配列
	var free = 0;		// freeアドレス数
	var destroyd = [];	// overlow/underflowアドレス配列
	while( !fp.AtEndOfStream ){
		var line = fp.ReadLine();
		if( /^\+/.test(line) ){
			// allocアドレス
			allocs.push( line );
		}
		else if( /^\-[0-9a-zA-Z]+/.test(line) ){
			// 破壊アドレス
			var flow = / overflow | underflow /.test(line);
			// freeアドレス
			var adr = /^\-([0-9a-zA-Z]+)/.exec(line)[1];
			// allocアドレス配列の一致アドレスを最初の1つだけ削除(解放成功)
			var reg = new RegExp('^\\+'+adr+':');
			for( var i=0; i<allocs.length; i++ ){
				if( reg.test(allocs[i]) ){
					if( flow ) destroyd.push(allocs[i]);
					allocs.splice(i,1);
					free++;
					break;
				}
			}
		}
	}
}
finally{
	fp.Close();
	WScript.Echo(free+' addresses ok, freed.');
	if( allocs.length ){
		WScript.Echo('Leak memory (unfreed) address below:');
		for( var i=0; i<allocs.length; i++ ) WScript.Echo(allocs[i]);
	}
	if( destroyd.length ){
		WScript.Echo('Overflow or Underflow address below:');
		for( var i=0; i<destroyd.length; i++ ) WScript.Echo(destroyd[i]);
	}
}
