import { APIGatewayProxyHandler } from 'aws-lambda';
import jwt, { JwtPayload as DefaultJwtPayload } from 'jsonwebtoken';
import { corsHeaders, USERS_TABLE, dynamoDb, JWT_SECRET } from './config';

// Función para verificar el token y extraer userId
const getUserIdFromToken = (authHeader: string | undefined): string | null => {
    if (!authHeader) return null;

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as DefaultJwtPayload;
        return decoded.userId;
    } catch (error) {
        return null;
    }
};

// Función para generar respuestas HTTP
const generateResponse = (statusCode: number, message: string, data: object = {}) => ({
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify({ message, ...data }),
});

// Función para validar parámetros requeridos
const validateParameters = (params: Record<string, any>, requiredParams: string[]) => {
    for (const param of requiredParams) {
        if (params[param] === undefined || params[param] === null) {
            return false;
        }
    }
    return true;
};

/**
 * UPDATE CATEGORY
 */
export const updateCategory: APIGatewayProxyHandler = async (event) => {
    const { categoryId } = event.pathParameters || {};
    const { categoryName } = JSON.parse(event.body || '{}');
    const userId = getUserIdFromToken(event.headers.Authorization || event.headers.authorization);

    if (!userId) {
        return generateResponse(401, 'Invalid or expired token');
    }

    if (!validateParameters({ categoryId, categoryName }, ['categoryId', 'categoryName'])) {
        return generateResponse(400, 'Category ID and name are required');
    }

    const params = {
        TableName: USERS_TABLE,
        Key: { PK: `USER#${userId}`, SK: `CATEGORY#${categoryId}` },
        UpdateExpression: 'SET categoryName = :categoryName',
        ExpressionAttributeValues: { ':categoryName': categoryName },
        ReturnValues: 'UPDATED_NEW',
    };

    try {
        const result = await dynamoDb.update(params).promise();
        return generateResponse(200, 'Category updated successfully', { data: result.Attributes });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Error updating category:', errorMessage);
        return generateResponse(500, 'Error updating category', { error: errorMessage });
    }
};

/**
 * UPDATE PRODUCT
 */
export const updateProduct: APIGatewayProxyHandler = async (event) => {
    const { productId } = event.pathParameters || {};
    const { productName, price, description } = JSON.parse(event.body || '{}');
    const userId = getUserIdFromToken(event.headers.Authorization || event.headers.authorization);

    if (!userId) {
        return generateResponse(401, 'Invalid or expired token');
    }

    if (!validateParameters({ productId, productName, price, description }, ['productId', 'productName', 'price', 'description'])) {
        return generateResponse(400, 'Product ID, name, price, and description are required');
    }

    const params = {
        TableName: USERS_TABLE,
        Key: { PK: `USER#${userId}`, SK: `PRODUCT#${productId}` },
        UpdateExpression: 'SET productName = :productName, price = :price, description = :description',
        ExpressionAttributeValues: {
            ':productName': productName,
            ':price': price,
            ':description': description,
        },
        ReturnValues: 'UPDATED_NEW',
    };

    try {
        const result = await dynamoDb.update(params).promise();
        return generateResponse(200, 'Product updated successfully', { data: result.Attributes });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Error updating product:', errorMessage);
        return generateResponse(500, 'Error updating product', { error: errorMessage });
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