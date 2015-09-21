// Basic tests for JUnzip library. Needs zlib. Should compile with
// something like gcc junzip_test.c junzip.c -lz -o junzip_test.exe
//
// Customized for JCBookmark by ZTMS (VC2008Express)
// >cl junzip_test.c
// > junzip_test.exe
// Verifying that all structs are correct size...
// JZLocalFileHeader: 30 vs. 30: OK
// JZGlobalFileHeader: 46 vs. 46: OK
// JZFileHeader: 22 vs. 22: OK
// JZEndRecord: 22 vs. 22: OK

#include <stdio.h>
#include <assert.h>

#include "zlib.h"

#include "junzip.h"

int main() {
    printf("Verifying that all structs are correct size...\n");

    printf("JZLocalFileHeader: %d vs. 30: ", (int)sizeof(JZLocalFileHeader));
    if(sizeof(JZLocalFileHeader) == 30) puts("OK"); else puts("FAILED!");

    printf("JZGlobalFileHeader: %d vs. 46: ", (int)sizeof(JZGlobalFileHeader));
    if(sizeof(JZGlobalFileHeader) == 46) puts("OK"); else puts("FAILED!");

    printf("JZFileHeader: %d vs. 22: ", (int)sizeof(JZFileHeader));
    if(sizeof(JZFileHeader) == 22) puts("OK"); else puts("FAILED!");

    printf("JZEndRecord: %d vs. 22: ", (int)sizeof(JZEndRecord));
    if(sizeof(JZEndRecord) == 22) puts("OK"); else puts("FAILED!");

    return 0;
}
