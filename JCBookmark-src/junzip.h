/**
 * JUnzip library by Joonas Pihlajamaa (firstname.lastname@iki.fi).
 * Released into public domain. https://github.com/jokkebk/JUnzip
 *
 * Customized for JCBookmark by ZTMS on VC2008Express
 * - struct definition
 * - struct member's type
 * - struct JZIP (for thread safe)
 * - function JZipOpen/JZipClose (for thread safe)
 * - function interface (parameter type) changed.
 * - struct member's name changed to short.
 * - error message function changed.
 */

#ifndef __JUNZIP_H
#define __JUNZIP_H

//#include <stdint.h>

// If you don't have stdint.h, the following two lines should work for most 32/64 bit systems
typedef unsigned int UINT32;
typedef unsigned short UINT16;

typedef struct {
#pragma pack(push,1)
    UINT32 signature;
    UINT16 versionNeededToExtract; // unsupported
    UINT16 generalPurposeBitFlag; // unsupported
    UINT16 compressMethod;
    UINT16 lastModFileTime;
    UINT16 lastModFileDate;
    UINT32 crc32;
    UINT32 packedBytes;
    UINT32 unpackBytes;
    UINT16 fileNameLength;
    UINT16 extraFieldLength; // unsupported
#pragma pack(pop)
} JZLocalFileHeader;

typedef struct {
#pragma pack(push,1)
    UINT32 signature;
    UINT16 versionMadeBy; // unsupported
    UINT16 versionNeededToExtract; // unsupported
    UINT16 generalPurposeBitFlag; // unsupported
    UINT16 compressMethod;
    UINT16 lastModFileTime;
    UINT16 lastModFileDate;
    UINT32 crc32;
    UINT32 packedBytes;
    UINT32 unpackBytes;
    UINT16 fileNameLength;
    UINT16 extraFieldLength; // unsupported
    UINT16 fileCommentLength; // unsupported
    UINT16 diskNumberStart; // unsupported
    UINT16 internalFileAttributes; // unsupported
    UINT32 externalFileAttributes; // unsupported
    UINT32 relativeOffsetOflocalHeader;
#pragma pack(pop)
} JZGlobalFileHeader;

typedef struct {
#pragma pack(push,1)
    UINT16 compressMethod;
    UINT16 lastModFileTime;
    UINT16 lastModFileDate;
    UINT32 crc32;
    UINT32 packedBytes;
    UINT32 unpackBytes;
    UINT32 offset;
#pragma pack(pop)
} JZFileHeader;

typedef struct {
#pragma pack(push,1)
    UINT32 signature; // 0x06054b50
    UINT16 diskNumber; // unsupported
    UINT16 centralDirectoryDiskNumber; // unsupported
    UINT16 numEntriesThisDisk; // unsupported
    UINT16 numEntries;
    UINT32 centralDirectorySize;
    UINT32 centralDirectoryOffset;
    UINT16 zipCommentLength;
    // Followed by .ZIP file comment (variable size)
#pragma pack(pop)
} JZEndRecord;

#define JZ_BUFFER_SIZE 65536 // limits maximum zip descriptor size

typedef struct {
    FILE* fp;
    void* exdata;
    unsigned char buffer[1];
} JZIP;

// error message function
typedef void (*JZErrorCallback)( const unsigned char* fmt, ... );

// Initialize
JZIP* JZipOpen( FILE* ,void* ,JZErrorCallback );

// Finalize
void JZipClose( JZIP* );

// Callback prototype for central and local file record reading functions
typedef int (*JZRecordCallback)( JZIP*, int, JZFileHeader*, char* );

// Read ZIP file end record. Will move within file.
int jzReadEndRecord( JZIP*, JZEndRecord* );

// Read ZIP file global directory. Will move within file.
// Callback is called for each record, until callback returns zero
int jzReadCentralDirectory( JZIP*, JZEndRecord*, JZRecordCallback );

// Read local ZIP file header. Silent on errors so optimistic reading possible.
int jzReadLocalFileHeader( JZIP*, JZFileHeader*, char*, int len );

// Read data from file stream, described by header, to preallocated buffer
// Return value is zlib coded, e.g. Z_OK, or error code
int jzReadData( JZIP*, JZFileHeader*, void* );

#endif
