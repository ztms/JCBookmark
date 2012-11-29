#
# memory.log を読み込んでリークチェック
# >perl memory.pl < memory.log
#
# memory.log の例
#   +00F56B20:malloc(102):.\MyBookmark.c:450
#   +00F58C10:malloc(18):.\MyBookmark.c:453
#   -00F56B20
#   -00F58C10
#
# TODO:realloc未考慮。
#
use strict;
use warnings;
my @alloc=(); # allocアドレス配列
my $free=0;   # freeアドレス数
while(<>){
    if(/^\+/){
	# allocアドレス
	push @alloc,$_;
    }
    elsif(/^\-([0-9a-fA-F]+)/){
	# freeアドレス
	my $adr=$1;
	# allocアドレス配列の一致アドレスを
	# 最初の1つだけ削除(解放成功)
	for(my $i=0; $i<=$#alloc; $i++){
	    if($alloc[$i]=~/^\+$adr:/){
		splice @alloc,$i,1;
		$free++;
		last;
	    }
	}
    }
}
print "$free addresses ok, freed.\n";
# 残ったalloc配列は解放漏れ
if( @alloc ){ print "Leak memory (unfreed) address below:\n@alloc"; }
