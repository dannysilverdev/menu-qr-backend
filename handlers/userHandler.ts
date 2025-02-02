import { APIGatewayProxyHandler } from 'aws-lambda';
import { corsHeaders, USERS_TABLE, dynamoDb } from './config.js';
import { GetCommand } from '@aws-sdk/lib-dynamodb';

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
        const result = await dynamoDb.send(new GetCommand(params));
        const { Item } = result;

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
        console.error('Error fetching user data:', error);
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
