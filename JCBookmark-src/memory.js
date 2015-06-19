//
// memory.pl �� JScript ��
// >cscript //nologo memory.js
//
var log = WScript.ScriptFullName.replace(WScript.ScriptName,'..\\JCBookmark\\memory.log');
var fs = new ActiveXObject('Scripting.FileSystemObject');
var fp = fs.OpenTextFile( log, 1, false );
try{
	var allocs = [];	// alloc�A�h���X�z��
	var free = 0;		// free�A�h���X��
	var destroyd = [];	// overlow/underflow�A�h���X�z��
	while( !fp.AtEndOfStream ){
		var line = fp.ReadLine();
		if( /^\+/.test(line) ){
			// alloc�A�h���X
			allocs.push( line );
		}
		else if( /^\-[0-9a-zA-Z]+/.test(line) ){
			// �j��A�h���X
			var flow = / overflow | underflow /.test(line);
			// free�A�h���X
			var adr = /^\-([0-9a-zA-Z]+)/.exec(line)[1];
			// alloc�A�h���X�z��̈�v�A�h���X���ŏ���1�����폜(�������)
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
