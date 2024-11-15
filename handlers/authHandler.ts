import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { corsHeaders, USERS_TABLE, dynamoDb, JWT_SECRET } from './config.js';
import { uploadImageToS3 } from './uploadImageToS3.js';

/**
 * User Registration Handler
 * Creates a new user account with hashed password and profile information
 */
export const signup: APIGatewayProxyHandler = async (event): Promise<APIGatewayProxyResult> => {
    const { username, password, localName, phoneNumber, imageBase64 } = JSON.parse(event.body || '{}');

    if (!username || !password || !localName || !phoneNumber || !imageBase64) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'All fields are required' }),
        };
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const buffer = Buffer.from(imageBase64, 'base64');

    let imageUrl = '';
    try {
        imageUrl = await uploadImageToS3(username, buffer);
    } catch (error) {
        const errorMessage = (error instanceof Error) ? error.message : 'Unknown error';
        console.error('Error uploading image:', errorMessage);

        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: errorMessage }),
        };
    }

    const params = {
        TableName: USERS_TABLE!,
        Item: {
            PK: `USER#${username}`,
            SK: 'PROFILE',
            password: hashedPassword,
            localName,
            phoneNumber,
            imageUrl,
        },
    };

    try {
        await dynamoDb.send(new PutCommand(params));
        return {
            statusCode: 201,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'User created successfully', imageUrl }),
        };
    } catch (error) {
        console.error('Error creating user:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Error creating user' }),
        };
    }
};

/**
 * User Login Handler
 * Authenticates user and returns JWT token
 */
export const login: APIGatewayProxyHandler = async (event) => {
    const { username, password } = JSON.parse(event.body || '{}');

    if (!username || !password) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Username and password are required' }),
        };
    }

    const params = {
        TableName: USERS_TABLE,
        Key: {
            PK: `USER#${username}`,
            SK: 'PROFILE',
        },
    };

    try {
        const result = await dynamoDb.send(new GetCommand(params));

        const { Item } = result;
        if (!Item || !(await bcrypt.compare(password, Item.password))) {
            return {
                statusCode: 401,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'Invalid credentials' }),
            };
        }

        // Genera el token JWT usando `jose`
        const jwtSecretKey = new TextEncoder().encode(JWT_SECRET);
        const token = await new SignJWT({ userId: username })
            .setProtectedHeader({ alg: 'HS256' })
            .setExpirationTime('1h')
            .sign(jwtSecretKey);

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ token }),
        };
    } catch (error: unknown) {
        const errorMessage = (error instanceof Error) ? error.message : 'Unknown error';
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Error logging in', error: errorMessage }),
        };
    }
};

/**
 * Verifies the JWT token
 * @param token - The JWT token
 * @returns Decoded payload if valid, otherwise throws an error
 */
export const verifyToken = async (token: string) => {
    const jwtSecretKey = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(token, jwtSecretKey);
    return payload;
};
