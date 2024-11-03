import { APIGatewayProxyHandler } from 'aws-lambda';
import jwt from 'jsonwebtoken';
import { corsHeaders, USERS_TABLE, dynamoDb, JWT_SECRET } from './config'

// ==========================================
// USER PROFILE MANAGEMENT
// ==========================================

/**
 * Get User Profile Handler
 * Retrieves user profile information
 */
export const getUser: APIGatewayProxyHandler = async (event) => {
    const userId = event.pathParameters?.userId;
    if (!userId) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'User ID is required' }),
        };
    }

    const params = {
        TableName: USERS_TABLE,
        Key: {
            PK: `USER#${userId}`,
            SK: 'PROFILE',
        },
    };

    try {
        const { Item } = await dynamoDb.get(params).promise();
        if (!Item) {
            return {
                statusCode: 404,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'User not found' }),
            };
        }

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify(Item),
        };
    } catch (error) {
        //console.error('Error fetching user data:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                message: 'Error fetching user data',
                error: error instanceof Error ? error.message : 'Unknown error',
            }),
        };
    }
};

/**
 * Update User Profile Handler
 * Updates user profile information
 */
// Guardado automatico para informacion de perfil
export const updateUserProfile: APIGatewayProxyHandler = async (event) => {
    const userId = event.pathParameters?.userId;
    const token = event.headers?.Authorization?.split(' ')[1];

    if (!userId || !token) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'User ID and token are required' }),
        };
    }

    try {
        jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return {
            statusCode: 401,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Invalid token' }),
        };
    }

    const updates = JSON.parse(event.body || '{}');
    console.log("Datos de actualización recibidos:", updates);

    const updateExpressions: string[] = [];
    const expressionAttributeValues: { [key: string]: any } = {}; // Definir tipo explícito
    const expressionAttributeNames: { [key: string]: string } = {};

    for (const [key, value] of Object.entries(updates)) {
        updateExpressions.push(`#${key} = :${key}`);
        expressionAttributeValues[`:${key}`] = value; // TypeScript ahora reconocerá este acceso dinámico
        expressionAttributeNames[`#${key}`] = key;
    }

    if (updateExpressions.length === 0) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'No fields provided for update' }),
        };
    }

    const updateParams = {
        TableName: USERS_TABLE,
        Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: expressionAttributeNames,
        ReturnValues: 'UPDATED_NEW',
    };

    try {
        console.log("Parámetros de actualización de DynamoDB:", updateParams);
        const result = await dynamoDb.update(updateParams).promise();
        console.log("Resultado de la actualización en DynamoDB:", result);
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                message: 'User profile updated successfully',
                updatedAttributes: result.Attributes,
            }),
        };
    } catch (error) {
        console.error('Error updating user profile:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                message: 'Error updating user profile',
                error: error instanceof Error ? error.message : 'Unknown error',
            }),
        };
    }
};