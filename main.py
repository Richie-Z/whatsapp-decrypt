#!/usr/bin/env python3

import re
import sys
import zlib
from pathlib import Path
from typing import Tuple

from Crypto.Cipher import AES


class Crypt14Decryptor:
    """
    WhatsApp Crypt14 file decryptor.
    """
    
    # File paths
    KEY_FILE = "key"
    ENCRYPTED_FILE = "msgstore.db.crypt14"
    OUTPUT_FILE = "msgstore.db"
    
    # Constants for key file parsing
    ZIP_HEADERS = [b'x\x01']
    BUFFER_SIZE = 8192
    
    def extract_keys_from_keyfile(self) -> Tuple[bytes, bytes]:
        """
        Extract t1 and encryption key from WhatsApp key file.
        
        The key file structure:
        - Bytes 30-62: t1 value (32 bytes)
        - Bytes 126-158: encryption key (32 bytes)
        
        Returns:
            Tuple of (t1_bytes, encryption_key)
        """
        keyfile_data = Path(self.KEY_FILE).read_bytes()
        
        t1 = keyfile_data[30:62]
        key = keyfile_data[126:158]
        
        return t1, key
    
    def decrypt_crypt14_file(self) -> None:
        """
        Decrypt the WhatsApp crypt14 file to SQLite database.
        
        Main decryption process:
        1. Extract keys from key file
        2. Find IV and data offsets in encrypted file
        3. Decrypt and decompress the data
        4. Write the resulting SQLite database
        """
        print("Extracting keys...")
        t1, encryption_key = self.extract_keys_from_keyfile()
        
        print("Analyzing encrypted file...")
        with open(self.ENCRYPTED_FILE, 'rb') as encrypted_file:
            header_data = encrypted_file.read(512)
            
            self._display_metadata(header_data, t1)
            iv_offset, data_offset = self._find_offsets(header_data, encryption_key)
            
            print("Decrypting data...")
            self._decrypt_to_file(encrypted_file, encryption_key, iv_offset, data_offset)
        
        print(f"Decryption complete! Output: {self.OUTPUT_FILE}")
    
    def _display_metadata(self, header_data: bytes, t1: bytes) -> None:
        """Display metadata like t1 offset and WhatsApp version."""
        t1_offset = header_data.find(t1)
        if t1_offset != -1:
            print(f"t1 found at offset: {t1_offset}")
        
        version_matches = re.findall(rb'\d(?:\.\d{1,3}){3}', header_data)
        if version_matches:
            print(f"WhatsApp version: {version_matches[0].decode()}")
    
    def _find_offsets(self, header_data: bytes, key: bytes) -> Tuple[int, int]:
        """
        Find the IV offset and data start offset in the encrypted file.
        
        Uses an oscillating search pattern around expected positions
        to locate the correct IV and validate it by attempting decryption.
        """
        for iv_offset in self._oscillate_around(67, 0, 512):
            data_offset = self._find_data_offset(header_data, iv_offset, key)
            if data_offset != -1:
                print(f"IV offset: {iv_offset}")
                print(f"Data offset: {data_offset}")
                return iv_offset, data_offset
        
        print("Could not find offsets")
        sys.exit(1)
    
    def _find_data_offset(self, header_data: bytes, iv_offset: int, key: bytes) -> int:
        """Find the start of encrypted data by testing decryption at various offsets."""
        iv = header_data[iv_offset:iv_offset + 16]
        
        for offset in self._oscillate_around(191, iv_offset + 16, 512):
            if self._test_decryption_at_offset(header_data, offset, key, iv):
                return offset
        
        return -1
    
    def _test_decryption_at_offset(self, header_data: bytes, offset: int, 
                                 key: bytes, iv: bytes) -> bool:
        """Test if decryption at given offset produces valid SQLite data."""
        try:
            cipher = AES.new(key, AES.MODE_GCM, iv)
            decrypted_sample = cipher.decrypt(header_data[offset:offset + 2])
            
            if decrypted_sample not in self.ZIP_HEADERS:
                return False
            
            cipher = AES.new(key, AES.MODE_GCM, iv)
            decrypted_data = cipher.decrypt(header_data[offset:])
            decompressed = zlib.decompressobj().decompress(decrypted_data)
            
            return (len(decompressed) >= 16 and 
                   decompressed[:15].decode('ascii') == 'SQLite format 3')
        
        except:
            return False
    
    def _decrypt_to_file(self, encrypted_file, key: bytes, iv_offset: int, 
                        data_offset: int) -> None:
        """Decrypt the entire file and write to output."""
        encrypted_file.seek(0)
        header_data = encrypted_file.read(512)
        iv = header_data[iv_offset:iv_offset + 16]
        
        cipher = AES.new(key, AES.MODE_GCM, iv)
        decompressor = zlib.decompressobj()
        
        encrypted_file.seek(data_offset)
        
        with open(self.OUTPUT_FILE, 'wb') as output_file:
            while True:
                chunk = encrypted_file.read(self.BUFFER_SIZE)
                if not chunk:
                    break
                
                decrypted_chunk = cipher.decrypt(chunk)
                decompressed_chunk = decompressor.decompress(decrypted_chunk)
                output_file.write(decompressed_chunk)
    
    def _oscillate_around(self, center: int, min_val: int, max_val: int):
        """Generate sequence: center, center-1, center+1, center-2, center+2, ..."""
        yield center
        for i in range(1, max(center - min_val, max_val - center)):
            if center - i >= min_val:
                yield center - i
            if center + i < max_val:
                yield center + i


def main():
    decryptor = Crypt14Decryptor()
    decryptor.decrypt_crypt14_file()


if __name__ == "__main__":
    main()
