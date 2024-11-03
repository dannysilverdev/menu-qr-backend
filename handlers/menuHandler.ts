import { APIGatewayProxyHandler } from 'aws-lambda';
import jwt, { JwtPayload as DefaultJwtPayload } from 'jsonwebtoken';
import { corsHeaders, USERS_TABLE, dynamoDb, JWT_SECRET } from './config'

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
        const decoded = jwt.verify(token, JWT_SECRET) as DefaultJwtPayload; // Asegúrate de que es un JwtPayload

        // Verifica si userId está presente en el token decodificado
        if (!decoded.userId) {
            return {
                statusCode: 403,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'Invalid token: userId not found' }),
            };
        }

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Welcome to the menu page!', userId: decoded.userId }), // Devuelve el userId
        };
    } catch (error) {
        return {
            statusCode: 403,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Invalid or expired token' }),
        };
    }
};