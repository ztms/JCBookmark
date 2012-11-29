#
# memory.log ��ǂݍ���Ń��[�N�`�F�b�N
# >perl memory.pl < memory.log
#
# memory.log �̗�
#   +00F56B20:malloc(102):.\MyBookmark.c:450
#   +00F58C10:malloc(18):.\MyBookmark.c:453
#   -00F56B20
#   -00F58C10
#
# TODO:realloc���l���B
#
use strict;
use warnings;
my @alloc=(); # alloc�A�h���X�z��
my $free=0;   # free�A�h���X��
while(<>){
    if(/^\+/){
	# alloc�A�h���X
	push @alloc,$_;
    }
    elsif(/^\-([0-9a-fA-F]+)/){
	# free�A�h���X
	my $adr=$1;
	# alloc�A�h���X�z��̈�v�A�h���X��
	# �ŏ���1�����폜(�������)
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
# �c����alloc�z��͉���R��
if( @alloc ){ print "Leak memory (unfreed) address below:\n@alloc"; }
