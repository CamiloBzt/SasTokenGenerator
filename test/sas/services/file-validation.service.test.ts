import { Test, TestingModule } from '@nestjs/testing';
import { ErrorMessages } from '@src/shared/enums/error-messages.enum';
import { BadRequestException } from '@src/shared/exceptions/bad-request.exception';
import { FileValidationService } from '../../../src/sas/services/file-validation.service';

describe('FileValidationService', () => {
  let service: FileValidationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FileValidationService],
    }).compile();

    service = module.get<FileValidationService>(FileValidationService);
  });

  describe('getFileExtension', () => {
    it('should extract file extension correctly', () => {
      expect(service['getFileExtension']('document.pdf')).toBe('.pdf');
      expect(service['getFileExtension']('image.jpeg')).toBe('.jpeg');
      expect(service['getFileExtension']('archive.tar.gz')).toBe('.gz');
      expect(service['getFileExtension']('file.TXT')).toBe('.txt');
    });

    it('should return empty string for files without extension', () => {
      expect(service['getFileExtension']('filename')).toBe('');
      expect(service['getFileExtension']('file.')).toBe('');
      expect(service['getFileExtension']('')).toBe('');
    });

    it('should handle edge cases', () => {
      expect(service['getFileExtension']('.hidden')).toBe('.hidden');
      expect(service['getFileExtension']('path/to/file.pdf')).toBe('.pdf');
      expect(service['getFileExtension']('file.with.multiple.dots.jpg')).toBe(
        '.jpg',
      );
    });
  });

  describe('validateMimeTypeAndExtension', () => {
    it('should pass for valid MIME type and extension combinations', () => {
      expect(() => {
        service.validateMimeTypeAndExtension('application/pdf', 'document.pdf');
      }).not.toThrow();

      expect(() => {
        service.validateMimeTypeAndExtension('image/jpeg', 'photo.jpg');
      }).not.toThrow();

      expect(() => {
        service.validateMimeTypeAndExtension('image/jpeg', 'photo.jpeg');
      }).not.toThrow();

      expect(() => {
        service.validateMimeTypeAndExtension('text/plain', 'readme.txt');
      }).not.toThrow();

      expect(() => {
        service.validateMimeTypeAndExtension('application/json', 'data.json');
      }).not.toThrow();
    });

    it('should handle case insensitive MIME types', () => {
      expect(() => {
        service.validateMimeTypeAndExtension('APPLICATION/PDF', 'document.pdf');
      }).not.toThrow();

      expect(() => {
        service.validateMimeTypeAndExtension('Image/JPEG', 'photo.jpg');
      }).not.toThrow();
    });

    it('should throw error when file has no extension', () => {
      expect(() => {
        service.validateMimeTypeAndExtension('application/pdf', 'document');
      }).toThrow(
        new BadRequestException(
          `${ErrorMessages.FILE_EXTENSION_MISSING} El archivo 'document' debe tener una extensión válida.`,
        ),
      );

      expect(() => {
        service.validateMimeTypeAndExtension('image/jpeg', 'photo.');
      }).toThrow(
        new BadRequestException(
          `${ErrorMessages.FILE_EXTENSION_MISSING} El archivo 'photo.' debe tener una extensión válida.`,
        ),
      );
    });

    it('should throw error when extension does not match MIME type', () => {
      expect(() => {
        service.validateMimeTypeAndExtension('application/pdf', 'document.jpg');
      }).toThrow(
        new BadRequestException(
          `${ErrorMessages.FILE_EXTENSION_MISMATCH} La extensión '.jpg' no coincide con el tipo MIME 'application/pdf'. Extensiones válidas: .pdf`,
        ),
      );

      expect(() => {
        service.validateMimeTypeAndExtension('image/jpeg', 'photo.png');
      }).toThrow(
        new BadRequestException(
          `${ErrorMessages.FILE_EXTENSION_MISMATCH} La extensión '.png' no coincide con el tipo MIME 'image/jpeg'. Extensiones válidas: .jpg, .jpeg`,
        ),
      );

      expect(() => {
        service.validateMimeTypeAndExtension('text/plain', 'data.json');
      }).toThrow(
        new BadRequestException(
          `${ErrorMessages.FILE_EXTENSION_MISMATCH} La extensión '.json' no coincide con el tipo MIME 'text/plain'. Extensiones válidas: .txt`,
        ),
      );
    });
  });

  describe('validateBlobNameExtension', () => {
    it('should pass for valid blob names with supported extensions', () => {
      const validBlobNames = [
        'document.pdf',
        'photo.jpg',
        'data.json',
        'readme.txt',
        'archive.zip',
        'video.mp4',
        'audio.mp3',
        'spreadsheet.xlsx',
        'presentation.pptx',
        'image.png',
      ];

      validBlobNames.forEach((blobName) => {
        expect(() => {
          service.validateBlobNameExtension(blobName);
        }).not.toThrow();
      });
    });

    it('should throw error when blob name has no extension', () => {
      expect(() => {
        service.validateBlobNameExtension('document');
      }).toThrow(
        new BadRequestException(
          `${ErrorMessages.FILE_EXTENSION_MISSING} El nombre del blob 'document' debe incluir una extensión de archivo.`,
        ),
      );

      expect(() => {
        service.validateBlobNameExtension('file.');
      }).toThrow(
        new BadRequestException(
          `${ErrorMessages.FILE_EXTENSION_MISSING} El nombre del blob 'file.' debe incluir una extensión de archivo.`,
        ),
      );
    });

    it('should throw error for unsupported extensions', () => {
      expect(() => {
        service.validateBlobNameExtension('virus.exe');
      }).toThrow(
        new BadRequestException(
          expect.stringContaining(
            `${ErrorMessages.FILE_EXTENSION_NOT_ALLOWED} La extensión '.exe' no está permitida.`,
          ),
        ),
      );

      expect(() => {
        service.validateBlobNameExtension('script.bat');
      }).toThrow(
        new BadRequestException(
          expect.stringContaining(
            `${ErrorMessages.FILE_EXTENSION_NOT_ALLOWED} La extensión '.bat' no está permitida.`,
          ),
        ),
      );

      expect(() => {
        service.validateBlobNameExtension('binary.bin');
      }).toThrow(
        new BadRequestException(
          expect.stringContaining(
            `${ErrorMessages.FILE_EXTENSION_NOT_ALLOWED} La extensión '.bin' no está permitida.`,
          ),
        ),
      );
    });

    it('should handle case insensitive extensions', () => {
      expect(() => {
        service.validateBlobNameExtension('document.PDF');
      }).not.toThrow();

      expect(() => {
        service.validateBlobNameExtension('photo.JPG');
      }).not.toThrow();

      expect(() => {
        service.validateBlobNameExtension('data.JSON');
      }).not.toThrow();
    });
  });

  describe('validateFileExtensionMatch', () => {
    it('should pass when original file and blob name have same extension', () => {
      expect(() => {
        service.validateFileExtensionMatch('original.pdf', 'renamed.pdf');
      }).not.toThrow();

      expect(() => {
        service.validateFileExtensionMatch('photo.jpg', 'new-photo.jpg');
      }).not.toThrow();

      expect(() => {
        service.validateFileExtensionMatch('data.json', 'backup.json');
      }).not.toThrow();
    });

    it('should handle case insensitive extensions', () => {
      expect(() => {
        service.validateFileExtensionMatch('document.PDF', 'file.pdf');
      }).not.toThrow();

      expect(() => {
        service.validateFileExtensionMatch('photo.JPG', 'image.jpg');
      }).not.toThrow();

      expect(() => {
        service.validateFileExtensionMatch('data.JSON', 'config.json');
      }).not.toThrow();
    });

    it('should throw error when original file has no extension', () => {
      expect(() => {
        service.validateFileExtensionMatch('originalfile', 'blob.pdf');
      }).toThrow(
        new BadRequestException(
          `${ErrorMessages.FILE_EXTENSION_MISSING} El archivo original 'originalfile' debe tener una extensión.`,
        ),
      );

      expect(() => {
        service.validateFileExtensionMatch('file.', 'blob.jpg');
      }).toThrow(
        new BadRequestException(
          `${ErrorMessages.FILE_EXTENSION_MISSING} El archivo original 'file.' debe tener una extensión.`,
        ),
      );
    });

    it('should throw error when blob name has no extension', () => {
      expect(() => {
        service.validateFileExtensionMatch('original.pdf', 'blobname');
      }).toThrow(
        new BadRequestException(
          `${ErrorMessages.FILE_EXTENSION_MISSING} El nombre del blob 'blobname' debe incluir una extensión.`,
        ),
      );

      expect(() => {
        service.validateFileExtensionMatch('photo.jpg', 'blob.');
      }).toThrow(
        new BadRequestException(
          `${ErrorMessages.FILE_EXTENSION_MISSING} El nombre del blob 'blob.' debe incluir una extensión.`,
        ),
      );
    });

    it('should throw error when extensions do not match', () => {
      expect(() => {
        service.validateFileExtensionMatch('document.pdf', 'file.jpg');
      }).toThrow(
        new BadRequestException(
          `${ErrorMessages.FILE_EXTENSION_MISMATCH} La extensión del archivo original '.pdf' no coincide con la extensión del blob '.jpg'.`,
        ),
      );

      expect(() => {
        service.validateFileExtensionMatch('photo.png', 'image.gif');
      }).toThrow(
        new BadRequestException(
          `${ErrorMessages.FILE_EXTENSION_MISMATCH} La extensión del archivo original '.png' no coincide con la extensión del blob '.gif'.`,
        ),
      );

      expect(() => {
        service.validateFileExtensionMatch('data.json', 'config.xml');
      }).toThrow(
        new BadRequestException(
          `${ErrorMessages.FILE_EXTENSION_MISMATCH} La extensión del archivo original '.json' no coincide con la extensión del blob '.xml'.`,
        ),
      );
    });
  });

  describe('validateMultipartUpload', () => {
    it('should pass for valid multipart upload', () => {
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'document.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('test'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      expect(() => {
        service.validateMultipartUpload(mockFile, 'uploaded-document.pdf');
      }).not.toThrow();
    });

    it('should throw error when blob name has invalid extension', () => {
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'document.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('test'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      expect(() => {
        service.validateMultipartUpload(mockFile, 'document.exe');
      }).toThrow(
        new BadRequestException(
          expect.stringContaining(
            `${ErrorMessages.FILE_EXTENSION_NOT_ALLOWED}`,
          ),
        ),
      );
    });

    it('should throw error when original file and blob extensions do not match', () => {
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'document.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('test'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      expect(() => {
        service.validateMultipartUpload(mockFile, 'document.jpg');
      }).toThrow(
        new BadRequestException(
          `${ErrorMessages.FILE_EXTENSION_MISMATCH} La extensión del archivo original '.pdf' no coincide con la extensión del blob '.jpg'.`,
        ),
      );
    });

    it('should throw error when MIME type does not match extension', () => {
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'document.pdf',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: 1024,
        buffer: Buffer.from('test'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      expect(() => {
        service.validateMultipartUpload(mockFile, 'document.pdf');
      }).toThrow(
        new BadRequestException(
          `${ErrorMessages.FILE_EXTENSION_MISMATCH} La extensión '.pdf' no coincide con el tipo MIME 'image/jpeg'. Extensiones válidas: .jpg, .jpeg`,
        ),
      );
    });

    it('should throw error when blob name has no extension', () => {
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'document.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('test'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      expect(() => {
        service.validateMultipartUpload(mockFile, 'document');
      }).toThrow(
        new BadRequestException(
          `${ErrorMessages.FILE_EXTENSION_MISSING} El nombre del blob 'document' debe incluir una extensión de archivo.`,
        ),
      );
    });
  });

  describe('validateBase64Upload', () => {
    it('should pass for valid Base64 upload', () => {
      expect(() => {
        service.validateBase64Upload('application/pdf', 'document.pdf');
      }).not.toThrow();

      expect(() => {
        service.validateBase64Upload('image/jpeg', 'photo.jpg');
      }).not.toThrow();

      expect(() => {
        service.validateBase64Upload('text/plain', 'readme.txt');
      }).not.toThrow();
    });

    it('should handle case insensitive MIME types', () => {
      expect(() => {
        service.validateBase64Upload('APPLICATION/PDF', 'document.pdf');
      }).not.toThrow();

      expect(() => {
        service.validateBase64Upload('Image/JPEG', 'photo.jpg');
      }).not.toThrow();
    });

    it('should throw error when blob name has invalid extension', () => {
      expect(() => {
        service.validateBase64Upload('application/pdf', 'document.exe');
      }).toThrow(
        new BadRequestException(
          expect.stringContaining(
            `${ErrorMessages.FILE_EXTENSION_NOT_ALLOWED}`,
          ),
        ),
      );
    });

    it('should throw error when MIME type does not match extension', () => {
      expect(() => {
        service.validateBase64Upload('application/pdf', 'document.jpg');
      }).toThrow(
        new BadRequestException(
          `${ErrorMessages.FILE_EXTENSION_MISMATCH} La extensión '.jpg' no coincide con el tipo MIME 'application/pdf'. Extensiones válidas: .pdf`,
        ),
      );

      expect(() => {
        service.validateBase64Upload('image/jpeg', 'photo.png');
      }).toThrow(
        new BadRequestException(
          `${ErrorMessages.FILE_EXTENSION_MISMATCH} La extensión '.png' no coincide con el tipo MIME 'image/jpeg'. Extensiones válidas: .jpg, .jpeg`,
        ),
      );
    });

    it('should throw error when blob name has no extension', () => {
      expect(() => {
        service.validateBase64Upload('application/pdf', 'document');
      }).toThrow(
        new BadRequestException(
          `${ErrorMessages.FILE_EXTENSION_MISSING} El nombre del blob 'document' debe incluir una extensión de archivo.`,
        ),
      );
    });

    it('should throw error for unsupported MIME type', () => {
      expect(() => {
        service.validateBase64Upload('application/exe', 'virus.exe');
      }).toThrow(
        new BadRequestException(
          `${ErrorMessages.MIME_TYPE_NOT_ALLOWED} Tipo MIME no soportado: application/exe`,
        ),
      );
    });
  });

  describe('Edge cases and comprehensive scenarios', () => {
    it('should handle complex file names with multiple dots', () => {
      expect(() => {
        service.validateFileExtensionMatch(
          'backup.2024.01.15.json',
          'config.data.json',
        );
      }).not.toThrow();

      expect(() => {
        service.validateMimeTypeAndExtension(
          'application/json',
          'complex.file.name.json',
        );
      }).not.toThrow();
    });

    it('should handle paths in file names', () => {
      expect(() => {
        service.validateFileExtensionMatch(
          'folder/subfolder/file.pdf',
          'renamed.pdf',
        );
      }).not.toThrow();
    });

    it('should handle all supported MIME types and extensions', () => {
      const testCases = [
        { mimeType: 'application/pdf', extension: '.pdf' },
        { mimeType: 'application/msword', extension: '.doc' },
        {
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          extension: '.docx',
        },
        { mimeType: 'application/vnd.ms-excel', extension: '.xls' },
        {
          mimeType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          extension: '.xlsx',
        },
        { mimeType: 'application/vnd.ms-powerpoint', extension: '.ppt' },
        {
          mimeType:
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          extension: '.pptx',
        },
        { mimeType: 'text/plain', extension: '.txt' },
        { mimeType: 'text/csv', extension: '.csv' },
        { mimeType: 'image/jpeg', extension: '.jpg' },
        { mimeType: 'image/jpeg', extension: '.jpeg' },
        { mimeType: 'image/png', extension: '.png' },
        { mimeType: 'image/gif', extension: '.gif' },
        { mimeType: 'image/bmp', extension: '.bmp' },
        { mimeType: 'image/webp', extension: '.webp' },
        { mimeType: 'image/svg+xml', extension: '.svg' },
        { mimeType: 'audio/mpeg', extension: '.mp3' },
        { mimeType: 'audio/wav', extension: '.wav' },
        { mimeType: 'video/mp4', extension: '.mp4' },
        { mimeType: 'video/avi', extension: '.avi' },
        { mimeType: 'video/quicktime', extension: '.mov' },
        { mimeType: 'application/zip', extension: '.zip' },
        { mimeType: 'application/x-rar-compressed', extension: '.rar' },
        { mimeType: 'application/x-7z-compressed', extension: '.7z' },
        { mimeType: 'application/json', extension: '.json' },
        { mimeType: 'application/xml', extension: '.xml' },
        { mimeType: 'text/xml', extension: '.xml' },
      ];

      testCases.forEach(({ mimeType, extension }) => {
        const fileName = `testfile${extension}`;
        expect(() => {
          service.validateMimeTypeAndExtension(mimeType, fileName);
        }).not.toThrow();

        expect(() => {
          service.validateBase64Upload(mimeType, fileName);
        }).not.toThrow();
      });
    });
  });
});
