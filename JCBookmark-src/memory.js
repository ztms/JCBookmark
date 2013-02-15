//
// memory.pl �� JScript ��
// >cscript //nologo memory.js
//
var log = WScript.ScriptFullName.replace(WScript.ScriptName,'..\\JCBookmark\\memory.log');
var fs = new ActiveXObject('Scripting.FileSystemObject');
var fp = fs.OpenTextFile( log, 1, false );
try{
	var alloc=[];	// alloc�A�h���X�z��
	var free=0;	// free�A�h���X��
	while( !fp.AtEndOfStream ){
		var line = fp.ReadLine();
		if( /^\+/.test(line) ){
			// alloc�A�h���X
			alloc.push( line );
		}
		else if( /^\-[0-9a-zA-Z]+/.test(line) ){
			// free�A�h���X
			var adr = /^\-([0-9a-zA-Z]+)/.exec(line)[1];
			// alloc�A�h���X�z��̈�v�A�h���X���ŏ���1�����폜(�������)
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
