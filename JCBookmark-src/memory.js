//
// memory.pl の JScript 版
// >cscript //nologo memory.js
//
var log = WScript.ScriptFullName.replace(WScript.ScriptName,'..\\JCBookmark\\memory.log');
var fs = new ActiveXObject('Scripting.FileSystemObject');
var fp = fs.OpenTextFile( log, 1, false );
try{
	var alloc=[];	// allocアドレス配列
	var free=0;	// freeアドレス数
	while( !fp.AtEndOfStream ){
		var line = fp.ReadLine();
		if( /^\+/.test(line) ){
			// allocアドレス
			alloc.push( line );
		}
		else if( /^\-[0-9a-zA-Z]+/.test(line) ){
			// freeアドレス
			var adr = /^\-([0-9a-zA-Z]+)/.exec(line)[1];
			// allocアドレス配列の一致アドレスを最初の1つだけ削除(解放成功)
			var reg = new RegExp('^\\+'+adr+':');
			for( var i=0; i<alloc.length; i++ ){
				if( reg.test(alloc[i]) ){
					alloc.splice(i,1);
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
	if( alloc.length ){
		WScript.Echo('Leak memory (unfreed) address below:');
		for( var i=0; i<alloc.length; i++ ) WScript.Echo(alloc[i]);
	}
}
