// JUnzip library by Joonas Pihlajamaa. See junzip.h for license and details.

#pragma warning(disable:4996)

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <zlib.h>

#include "junzip.h"

// Default error message function
void jzerr( const unsigned char* fmt, ... )
{
	unsigned char msg[256]="";
	va_list arg;

	va_start( arg, fmt );
	_vsnprintf( msg, sizeof(msg), fmt, arg );
	va_end( arg );

	msg[sizeof(msg)-1] = '\0';
	fputs( msg ,stderr );
}

// Error message function pointer
JZErrorCallback jzerror = jzerr;

// Initialize
JZIP* JZipOpen( FILE* fp ,void* exdata ,JZErrorCallback callback )
{
	JZIP* jz;
	if( callback ) jzerror = callback;
	
	jz = malloc( sizeof(FILE*) + JZ_BUFFER_SIZE );
	if( jz ){
		jz->fp = fp;
		jz->exdata = exdata;
	}
	else jzerror("L%u:cannot allocate memory!",__LINE__);
	return jz;
}

// Finalize
void JZipClose( JZIP* jz )
{
	if( jz ){
		if( jz->fp ) fclose( jz->fp );
		free( jz );
	}
}

// Read ZIP file end record. Will move within file.
int jzReadEndRecord( JZIP *jz, JZEndRecord *endRecord )
{
	long fileSize, i;
	size_t readBytes;
	JZEndRecord *er;

	if( fseek(jz->fp, 0, SEEK_END) ){
		jzerror("Couldn't go to end of zip file!");
		return Z_ERRNO;
	}

	if( (fileSize = ftell(jz->fp)) <= sizeof(JZEndRecord) ){
		jzerror("Too small file to be a zip!");
		return Z_ERRNO;
	}

	readBytes = (fileSize < JZ_BUFFER_SIZE) ? fileSize : JZ_BUFFER_SIZE;

	if( fseek(jz->fp, fileSize - readBytes, SEEK_SET) ){
		jzerror("Cannot seek in zip file!");
		return Z_ERRNO;
	}

	if( fread(jz->buffer, 1, readBytes, jz->fp) < readBytes ){
		jzerror("Couldn't read end of zip file!");
		return Z_ERRNO;
	}

	// Naively assume signature can only be found in one place...
	for( i = readBytes - sizeof(JZEndRecord); i >= 0; i-- ){
		er = (JZEndRecord *)(jz->buffer + i);
		if( er->signature == 0x06054B50 ) break;
	}

	if( i < 0 ){
		jzerror("End record signature not found in zip!");
		return Z_ERRNO;
	}

	memcpy( endRecord, er, sizeof(JZEndRecord) );

	if( endRecord->diskNumber ||
	    endRecord->centralDirectoryDiskNumber ||
	    endRecord->numEntries != endRecord->numEntriesThisDisk
	){
		jzerror("Multifile zips not supported!");
		return Z_ERRNO;
	}

	return Z_OK;
}

// Read ZIP file global directory. Will move within file.
int jzReadCentralDirectory( JZIP* jz, JZEndRecord* endRecord, JZRecordCallback callback )
{
	JZGlobalFileHeader fileHeader;
	JZFileHeader header;
	int i;

	if( fseek(jz->fp, endRecord->centralDirectoryOffset, SEEK_SET) ){
		jzerror("Cannot seek in zip file!");
		return Z_ERRNO;
	}

	for( i=0; i<endRecord->numEntries; i++ ){
		if( fread(&fileHeader, 1, sizeof(JZGlobalFileHeader), jz->fp) < sizeof(JZGlobalFileHeader) ){
			jzerror("Couldn't read file header %d!", i);
			return Z_ERRNO;
		}

		if( fileHeader.signature != 0x02014B50 ){
			jzerror("Invalid file header signature %d!", i);
			return Z_ERRNO;
		}

		if( fileHeader.fileNameLength + 1 >= JZ_BUFFER_SIZE ){
			jzerror("Too long file name %d!", i);
			return Z_ERRNO;
		}

		if( fread(jz->buffer, 1, fileHeader.fileNameLength, jz->fp) < fileHeader.fileNameLength ){
			jzerror("Couldn't read filename %d!", i);
			return Z_ERRNO;
		}

		jz->buffer[fileHeader.fileNameLength] = '\0'; // NULL terminate

		if( fseek(jz->fp, fileHeader.extraFieldLength, SEEK_CUR) ||
		    fseek(jz->fp, fileHeader.fileCommentLength, SEEK_CUR)
		){
			jzerror("Couldn't skip extra field or file comment %d", i);
			return Z_ERRNO;
		}

		// Construct JZFileHeader from global file header
		memcpy(&header, &fileHeader.compressMethod, sizeof(header));
		header.offset = fileHeader.relativeOffsetOflocalHeader;

		if( !callback(jz, i, &header, (char*)jz->buffer) ) break; // end if callback returns zero
	}

	return Z_OK;
}

// Read local ZIP file header. Silent on errors so optimistic reading possible.
int jzReadLocalFileHeader( JZIP* jz, JZFileHeader* header, char* filename, int len )
{
	JZLocalFileHeader localHeader;

	if( fread(&localHeader, 1, sizeof(JZLocalFileHeader), jz->fp) < sizeof(JZLocalFileHeader) )
		return Z_ERRNO;

	if( localHeader.signature != 0x04034B50 )
		return Z_ERRNO;

	if( len ){ // read filename
		if( localHeader.fileNameLength >= len )
			return Z_ERRNO; // filename cannot fit

		if( fread(filename, 1, localHeader.fileNameLength, jz->fp) < localHeader.fileNameLength )
			return Z_ERRNO; // read fail

		filename[localHeader.fileNameLength] = '\0'; // NULL terminate
	}
	else{ // skip filename
		if( fseek(jz->fp, localHeader.fileNameLength, SEEK_CUR) )
			return Z_ERRNO;
	}

	if( localHeader.extraFieldLength ){
		if( fseek(jz->fp, localHeader.extraFieldLength, SEEK_CUR) )
			return Z_ERRNO;
	}

	// For now, silently ignore bit flags and hope ZLIB can uncompress
	// if(localHeader.generalPurposeBitFlag)
	//	 return Z_ERRNO; // Flags not supported

	if( localHeader.compressMethod == 0 && (localHeader.packedBytes != localHeader.unpackBytes) )
		return Z_ERRNO; // Method is "store" but sizes indicate otherwise, abort

	memcpy( header, &localHeader.compressMethod, sizeof(JZFileHeader) );
	header->offset = 0; // not used in local context

	return Z_OK;
}

// Read data from file stream, described by header, to preallocated buffer
int jzReadData( JZIP* jz, JZFileHeader* header, void* buffer )
{
	unsigned char *bytes = (unsigned char *)buffer; // cast
	long packedLeft, unpackLeft;
	z_stream strm;
	int ret;

	if( header->compressMethod == 0 ){ // Store - just read it
		if( fread(buffer, 1, header->unpackBytes, jz->fp) < header->unpackBytes || ferror(jz->fp) )
			return Z_ERRNO;
	}
	else if( header->compressMethod == 8 ){ // Deflate - using zlib
		strm.zalloc = Z_NULL;
		strm.zfree = Z_NULL;
		strm.opaque = Z_NULL;

		strm.avail_in = 0;
		strm.next_in = Z_NULL;

		// Use inflateInit2 with negative window bits to indicate raw data
		if( (ret = inflateInit2(&strm, -MAX_WBITS)) != Z_OK )
			return ret; // Zlib errors are negative

		// Inflate compressed data
		for( packedLeft = header->packedBytes, unpackLeft = header->unpackBytes;
		     packedLeft && unpackLeft && ret != Z_STREAM_END;
		     packedLeft -= strm.avail_in
		){
			// Read next chunk
			strm.avail_in = fread(
				jz->buffer
				,1
				,(JZ_BUFFER_SIZE < packedLeft) ? JZ_BUFFER_SIZE : packedLeft
				,jz->fp
			);

			if( strm.avail_in == 0 || ferror(jz->fp) ){
				inflateEnd(&strm);
				return Z_ERRNO;
			}

			strm.next_in = jz->buffer;
			strm.avail_out = unpackLeft;
			strm.next_out = bytes;

			packedLeft -= strm.avail_in; // inflate will change avail_in

			ret = inflate( &strm, Z_NO_FLUSH );

			if( ret == Z_STREAM_ERROR ) return ret; // shouldn't happen

			switch (ret) {
				case Z_NEED_DICT:
					ret = Z_DATA_ERROR;	 /* and fall through */
				case Z_DATA_ERROR: case Z_MEM_ERROR:
					(void)inflateEnd(&strm);
					return ret;
			}

			bytes += unpackLeft - strm.avail_out; // bytes uncompressed
			unpackLeft = strm.avail_out;
		}

		inflateEnd(&strm);
	}
	else{
		return Z_ERRNO;
	}

	return Z_OK;
}
