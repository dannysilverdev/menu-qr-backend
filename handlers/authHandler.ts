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
    try {
        console.log('Received event:', event);

        // Parse and validate the request body
        const body = event.body ? JSON.parse(event.body) : {};
        const { username, password, localName, phoneNumber, imageBase64 } = body;

        // Validate input fields
        if (
            !username || !password || !localName || !phoneNumber || !imageBase64 ||
            typeof username !== 'string' ||
            typeof password !== 'string' ||
            typeof localName !== 'string' ||
            typeof phoneNumber !== 'string' ||
            typeof imageBase64 !== 'string' ||
            !username.trim() ||
            !password.trim() ||
            !localName.trim() ||
            !phoneNumber.trim() ||
            !imageBase64.trim()
        ) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'All fields must be non-empty strings' }),
            };
        }

        console.log('Validated input:', { username, localName, phoneNumber });

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);
        console.log('Password hashed successfully');

        // Convert image from Base64 and upload to S3
        const buffer = Buffer.from(imageBase64, 'base64');
        let imageUrl = '';
        try {
            imageUrl = await uploadImageToS3(username, buffer);
            console.log('Image uploaded successfully to S3:', imageUrl);
        } catch (error) {
            const errorMessage = (error instanceof Error) ? error.message : 'Unknown error';
            console.error('Error uploading image:', errorMessage);
            return {
                statusCode: 500,
                headers: corsHeaders,
                body: JSON.stringify({ message: `Error uploading image: ${errorMessage}` }),
            };
        }

        // Prepare the DynamoDB record
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

        // Insert record into DynamoDB
        try {
            await dynamoDb.send(new PutCommand(params));
            console.log('User record created successfully in DynamoDB');
            return {
                statusCode: 201,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'User created successfully', imageUrl }),
            };
        } catch (error) {
            console.error('Error saving user to DynamoDB:', error);
            return {
                statusCode: 500,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'Error creating user in database' }),
            };
        }
    } catch (error) {
        console.error('Unexpected error occurred:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Internal Server Error' }),
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
