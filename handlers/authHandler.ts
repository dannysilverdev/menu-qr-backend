import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { corsHeaders, USERS_TABLE, dynamoDb, JWT_SECRET } from './config'
// ==========================================
// AUTHENTICATION AND USER MANAGEMENT
// ==========================================

/**
 * User Registration Handler
 * Creates a new user account with hashed password and profile information
 */
export const signup: APIGatewayProxyHandler = async (event) => {
    const { username, password, localName, description, phoneNumber, socialMedia } = JSON.parse(event.body || '{}');

    if (!username || !password || !localName || !phoneNumber) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Username, password, localName, and phoneNumber are required' }),
        };
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const params = {
        TableName: USERS_TABLE,
        Item: {
            PK: `USER#${username}`,
            SK: 'PROFILE',
            password: hashedPassword,
            localName,
            description: description || '', // Campo opcional
            phoneNumber,
            socialMedia: socialMedia || [], // Inicializar redes sociales como un array vacío si no se proporciona
        },
    };

    try {
        await dynamoDb.put(params).promise();
        return {
            statusCode: 201,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'User created successfully' }),
        };
    } catch (error) {
        console.error('Error creating user:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                message: 'Error creating user',
                error: error instanceof Error ? error.message : 'Unknown error',
            }),
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
            SK: 'PROFILE'
        },
    };

    try {
        const { Item } = await dynamoDb.get(params).promise();

        // Asegúrate de que el objeto Item tenga la propiedad userId
        if (!Item || !(await bcrypt.compare(password, Item.password))) {
            return {
                statusCode: 401,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'Invalid credentials' }),
            };
        }

        // Verifica que userId esté presente en Item
        const token = jwt.sign({ userId: username }, JWT_SECRET, { expiresIn: '1h' });

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