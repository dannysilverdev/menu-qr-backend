import { APIGatewayProxyHandler } from 'aws-lambda';
import { jwtVerify } from 'jose';
import { corsHeaders, JWT_SECRET } from './config.js';

/**
 * MENU PAGE
 * THIS FUNCTION MANAGES MENU ITEMS DATA
 */
export const menu: APIGatewayProxyHandler = async (event) => {
    const authHeader = event.headers.Authorization || event.headers.authorization;

    if (!authHeader) {
        return {
            statusCode: 401,
            body: JSON.stringify({ message: 'Authorization header missing' }),
        };
    }

    const token = authHeader.split(' ')[1];

    try {
        const jwtSecretKey = new TextEncoder().encode(JWT_SECRET);
        const { payload } = await jwtVerify(token, jwtSecretKey);

        // Verifica si userId está presente en el payload decodificado
        if (!payload.userId) {
            return {
                statusCode: 403,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'Invalid token: userId not found' }),
            };
        }

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Welcome to the menu page!', userId: payload.userId }), // Devuelve el userId
        };
    } catch (error) {
        console.error('Token verification failed:', error);
        return {
            statusCode: 403,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Invalid or expired token' }),
        };
    }
};
