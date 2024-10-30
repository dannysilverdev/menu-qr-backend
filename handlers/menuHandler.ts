// src/pages/updateItemField.ts
import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, USERS_TABLE } from './config';

export const updateItemField: APIGatewayProxyHandler = async (event) => {
    const { itemId, userId } = event.pathParameters || {};  // Obtener itemId y userId de pathParameters
    const body = JSON.parse(event.body || '{}');
    const { fieldName, fieldValue, type } = body;

    // Validación de campos requeridos
    if (!itemId || !userId || !fieldName || fieldValue === undefined || !type) {
        console.log("Faltan campos requeridos:", { itemId, userId, fieldName, fieldValue, type });
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Missing required fields' }),
        };
    }

    // Definir las claves PK y SK para la categoría o producto
    const itemKey = type === 'category' ? `USER#${userId}` : `CATEGORY#${userId}`;
    const sortKey = type === 'category' ? `CATEGORY#${itemId}` : `PRODUCT#${itemId}`;

    // Configuración de los parámetros de actualización para el campo específico
    const params = {
        TableName: USERS_TABLE,
        Key: {
            PK: itemKey,
            SK: sortKey,
        },
        UpdateExpression: `SET ${fieldName} = :fieldValue`,  // Actualizar el campo indicado
        ExpressionAttributeValues: {
            ':fieldValue': fieldValue,  // Nuevo valor del campo
        },
        ReturnValues: 'UPDATED_NEW',
    };

    try {
        console.log("Actualizando item en DynamoDB:", params);
        const result = await dynamoDb.update(params).promise();
        console.log("Resultado de la actualización:", result);
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: `${type} updated successfully`,
                updatedAttributes: result.Attributes,
            }),
        };
    } catch (error) {
        console.error("Error al actualizar el item:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: `Error updating ${type}`,
                error: error instanceof Error ? error.message : 'Unknown error',
            }),
        };
    }
};
