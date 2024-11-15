// Función para cargar dotenv de forma condicional en desarrollo
const loadDotenv = async () => {
    if (process.env.NODE_ENV !== 'production') {
        const dotenv = await import('dotenv');
        dotenv.config({ path: '.env' });
    }
};

// Ejecutar la carga de dotenv al inicio
loadDotenv();

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Configuración de AWS
const s3Client = new S3Client({ region: process.env.AWS_REGION });
const BUCKET_NAME = process.env.BUCKET_NAME;

console.log('Stage-Name:', process.env.NODE_ENV);
console.log('Bucket-Stage-Name:', process.env.BUCKET_NAME);

// Función para obtener dimensiones de imágenes PNG
const getPngDimensions = (buffer: Buffer): { width: number; height: number } => {
    if (buffer.toString('ascii', 1, 4) !== 'PNG') {
        throw new Error('Not a valid PNG file');
    }
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
};

// Función para obtener dimensiones de imágenes JPEG
const getJpegDimensions = (buffer: Buffer): { width: number; height: number } => {
    let offset = 2;
    while (offset < buffer.length) {
        if (buffer[offset] === 0xFF && buffer[offset + 1] === 0xC0) {
            const height = buffer.readUInt16BE(offset + 5);
            const width = buffer.readUInt16BE(offset + 7);
            return { width, height };
        }
        offset += 2 + buffer.readUInt16BE(offset + 2);
    }
    throw new Error('Not a valid JPEG file');
};

// Función para determinar el tipo de imagen y obtener sus dimensiones
const getImageDimensions = (buffer: Buffer): { width: number; height: number } => {
    if (buffer[0] === 0x89 && buffer[1] === 0x50) {
        // Es un PNG
        return getPngDimensions(buffer);
    } else if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
        // Es un JPEG
        return getJpegDimensions(buffer);
    } else {
        throw new Error('Unsupported image format');
    }
};

export const uploadImageToS3 = async (username: string, imageBuffer: Buffer): Promise<string> => {
    const imageKey = `users_images/${username}/profile_${Date.now()}.png`;

    try {
        // Obtener las dimensiones de la imagen
        const dimensions = getImageDimensions(imageBuffer);
        if (!dimensions.width || !dimensions.height) {
            throw new Error('Could not determine image dimensions');
        }
        console.log(`Width: ${dimensions.width}, Height: ${dimensions.height}`);

        // Preparar el comando de carga a S3
        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME!,
            Key: imageKey,
            Body: imageBuffer,
            ContentType: 'image/png', // Cambia esto si tu imagen es de otro formato
        });

        // Subir la imagen a S3
        await s3Client.send(command);

        // Construir y retornar la URL de S3
        return `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${imageKey}`;
    } catch (error) {
        console.error('Error uploading image:', error);
        throw new Error('Error uploading image');
    }
};
