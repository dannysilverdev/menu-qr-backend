import { APIGatewayProxyHandler } from 'aws-lambda';
import AWS from 'aws-sdk';
import bcrypt from 'bcryptjs';
import jwt, { JwtPayload as DefaultJwtPayload } from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

// Detecta si está en producción (AWS Lambda) o en local (desarrollo)
const isProduction = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

const dynamoDb = new AWS.DynamoDB.DocumentClient(
    !isProduction
        ? { endpoint: 'http://localhost:8000' } // Usar DynamoDB local solo en entornos de desarrollo
        : {} // Configuración predeterminada para producción en AWS
);

const USERS_TABLE = `MenuQrUsersTable-${process.env.NODE_ENV || 'dev'}`;
const JWT_SECRET = 'd84e25a4-f70b-42b8-a4e9-9c6a8e16a7c5'; // Ahora fijo


interface CustomJwtPayload extends DefaultJwtPayload {
    userId: string;
}

interface Product {
    productName: string;
    price: number;
    description: string;
    productId: string;
    createdAt: string;
    categoryId: string; // Agregado
}

interface Category {
    categoryName: string;
    SK: string;
    products: Product[];
}

// Cabeceras CORS
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": true,
};

export const home: APIGatewayProxyHandler = async (event) => {
    const authHeader = event.headers.Authorization || event.headers.authorization;

    if (!authHeader) {
        return {
            statusCode: 401,
            body: JSON.stringify({ message: 'Authorization header missing' }),
        };
    }

    const token = authHeader.split(' ')[1];

    try {
        jwt.verify(token, JWT_SECRET);
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Welcome to the protected home page!' }),
        };
    } catch (error) {
        return {
            statusCode: 403,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Invalid or expired token', error: error instanceof Error ? error.message : 'Unknown error' }),
        };
    }
};

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

// Función para registrar un nuevo usuario (signup)
export const signup: APIGatewayProxyHandler = async (event) => {
    const { username, password } = JSON.parse(event.body || '{}');
    console.log(process.env.USERS_TABLE)

    if (!username || !password) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Username and password are required' }),
        };
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const params = {
        TableName: USERS_TABLE,
        Item: {
            PK: `USER#${username}`, // Establecer PK
            SK: 'PROFILE', // Establecer SK
            password: hashedPassword, // Almacenar la contraseña hasheada
        },
    };

    try {
        await dynamoDb.put(params).promise();
        return {
            statusCode: 201,
            body: JSON.stringify({ message: 'User created successfully' }),
        };
    } catch (error) {
        console.error('Error creating user:', error); // Agregar un log para errores
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

export const login: APIGatewayProxyHandler = async (event) => {
    const { username, password } = JSON.parse(event.body || '{}');

    if (!username || !password) {
        return {
            statusCode: 400,
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
                body: JSON.stringify({ message: 'Invalid credentials' }),
            };
        }

        // Verifica que userId esté presente en Item
        const token = jwt.sign({ userId: username }, JWT_SECRET, { expiresIn: '1h' });

        return {
            statusCode: 200,
            body: JSON.stringify({ token }),
        };
    } catch (error: unknown) {
        const errorMessage = (error instanceof Error) ? error.message : 'Unknown error';
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Error logging in', error: errorMessage }),
        };
    }
};

// Función para crear una categoría
export const createCategory: APIGatewayProxyHandler = async (event) => {
    const { userId, categoryName } = JSON.parse(event.body || '{}');
    const categoryId = uuidv4(); // Generar un ID único para la categoría

    const params = {
        TableName: USERS_TABLE,
        Item: {
            PK: `USER#${userId}`,  // Clave primaria del usuario
            SK: `CATEGORY#${categoryId}`, // Clave secundaria para la categoría
            categoryName, // Nombre de la categoría
            createdAt: new Date().toISOString(), // Fecha de creación
        },
    };

    try {
        await dynamoDb.put(params).promise();
        return {
            statusCode: 201,
            body: JSON.stringify({
                message: 'Category created successfully',
                categoryId, // Devuelve el ID de la categoría creada
                categoryName // Incluye el nombre de la categoría en la respuesta
            }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Error creating category',
                error: error instanceof Error ? error.message : 'Unknown error',
            }),
        };
    }
};


// Función para crear un producto en una categoría
export const createProduct: APIGatewayProxyHandler = async (event) => {
    const { categoryId } = event.pathParameters || {};
    const authHeader = event.headers.Authorization || event.headers.authorization;

    if (!authHeader) {
        return {
            statusCode: 401,
            body: JSON.stringify({ message: 'Authorization header missing' }),
        };
    }

    const token = authHeader.split(' ')[1];
    let userId: string;

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as DefaultJwtPayload;
        userId = decoded.userId;
    } catch (error) {
        return {
            statusCode: 403,
            body: JSON.stringify({ message: 'Invalid or expired token' }),
        };
    }

    if (!categoryId) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Category ID is required' }),
        };
    }

    const { productName, price, description } = JSON.parse(event.body || '{}');

    if (!productName || !price || !description) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Product name, price, and description are required' }),
        };
    }

    const productId = uuidv4();
    const createdAt = new Date().toISOString();

    const params = {
        TableName: USERS_TABLE,
        Item: {
            PK: `USER#${userId}`,
            SK: `PRODUCT#${productId}`,
            categoryId: `CATEGORY#${categoryId}`,
            productName,
            price,
            description,
            createdAt,
        },
    };

    try {
        await dynamoDb.put(params).promise();
        return {
            statusCode: 201,
            body: JSON.stringify({
                message: 'Product created successfully',
                product: {
                    productName,
                    price,
                    description,
                    productId,
                    createdAt,
                },
            }),
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Error creating product:', errorMessage);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Error creating product', error: errorMessage }),
        };
    }
};

// Obtener Categorias con Productos
export const getCategories: APIGatewayProxyHandler = async (event) => {
    const authHeader = event.headers.Authorization || event.headers.authorization;

    if (!authHeader) {
        return {
            statusCode: 401,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Authorization header missing' }),
        };
    }

    const token = authHeader.split(' ')[1];
    let userId: string;

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as CustomJwtPayload;
        userId = decoded.userId;
    } catch (error) {
        return {
            statusCode: 403,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Invalid or expired token' }),
        };
    }

    // Obtener todas las categorías del usuario
    const categoriesParams = {
        TableName: USERS_TABLE,
        KeyConditionExpression: 'PK = :pk and begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
            ':pk': `USER#${userId}`,
            ':skPrefix': 'CATEGORY#',
        },
    };

    // Obtener todos los productos del usuario en una sola consulta
    const productsParams = {
        TableName: USERS_TABLE,
        KeyConditionExpression: 'PK = :pk and begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
            ':pk': `USER#${userId}`,
            ':skPrefix': 'PRODUCT#',
        },
    };

    try {
        const [categoriesResult, productsResult] = await Promise.all([
            dynamoDb.query(categoriesParams).promise(),
            dynamoDb.query(productsParams).promise()
        ]);

        const categories: Category[] = (categoriesResult.Items || []).map(item => ({
            categoryName: item.categoryName,
            SK: item.SK,
            products: [],
        }));

        const products: Product[] = (productsResult.Items || []).map((product: any) => ({
            productName: product.productName,
            price: product.price,
            description: product.description,
            productId: product.SK.split('#')[1],
            createdAt: product.createdAt,
            categoryId: product.categoryId, // Incluir categoryId
        }));

        // Agrupar productos por categoría
        const categoryMap: { [key: string]: Product[] } = {};

        products.forEach(product => {
            const categoryKey = product.categoryId; // Asegúrate de que `categoryId` esté correctamente asignado
            if (!categoryMap[categoryKey]) {
                categoryMap[categoryKey] = [];
            }
            categoryMap[categoryKey].push(product);
        });

        // Asignar productos a sus respectivas categorías
        const categoriesWithProducts: Category[] = categories.map(category => ({
            ...category,
            products: categoryMap[category.SK] || [],
        }));

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ categories: categoriesWithProducts }),
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error fetching categories and products:', errorMessage);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Could not retrieve categories and products', error: errorMessage }),
        };
    }
};

// Función para eliminar una categoría y sus productos asociados
// Función para eliminar categoría y productos asociados
export const deleteCategory: APIGatewayProxyHandler = async (event) => {
    const { categoryId } = event.pathParameters || {};
    const authHeader = event.headers.Authorization || event.headers.authorization;

    if (!authHeader) {
        return {
            statusCode: 401,
            body: JSON.stringify({ message: 'Authorization header missing' }),
        };
    }

    const token = authHeader.split(' ')[1];
    let userId;

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as DefaultJwtPayload;
        userId = decoded.userId;
    } catch (error) {
        return {
            statusCode: 403,
            body: JSON.stringify({ message: 'Invalid or expired token' }),
        };
    }

    if (!categoryId) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Category ID is required' }),
        };
    }

    // Consulta para obtener productos asociados utilizando el índice
    const productQueryParams = {
        TableName: USERS_TABLE,
        IndexName: 'categoryId-index',
        KeyConditionExpression: 'categoryId = :categoryIdVal',
        ExpressionAttributeValues: {
            ':categoryIdVal': `CATEGORY#${categoryId}`,
        },
    };

    try {
        // Obtener productos asociados
        const productsResult = await dynamoDb.query(productQueryParams).promise();
        const products = productsResult.Items || [];

        // Batch delete para eliminar productos asociados
        if (products.length > 0) {
            const deleteRequests = products.map((product) => ({
                DeleteRequest: {
                    Key: {
                        PK: product.PK,
                        SK: product.SK,
                    },
                },
            }));

            const batchDeleteParams = {
                RequestItems: {
                    [USERS_TABLE]: deleteRequests,
                },
            };

            await dynamoDb.batchWrite(batchDeleteParams).promise();
            console.log('Productos eliminados:', deleteRequests);
        }

        // Eliminar la categoría
        const deleteCategoryParams = {
            TableName: USERS_TABLE,
            Key: {
                PK: `USER#${userId}`,
                SK: `CATEGORY#${categoryId}`,
            },
        };

        await dynamoDb.delete(deleteCategoryParams).promise();
        console.log('Categoría eliminada con éxito:', categoryId);

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Category and associated products deleted successfully' }),
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error deleting category and products:', errorMessage);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Error deleting category and products', error: errorMessage }),
        };
    }
};


// Eliminar producto
export const deleteProduct: APIGatewayProxyHandler = async (event) => {
    try {
        // Obtén parámetros y valida token
        const { categoryId, productId } = event.pathParameters || {};
        const token = event.headers.Authorization?.split(' ')[1];
        if (!token || !categoryId || !productId) throw new Error('Missing parameters or token');

        const { userId } = jwt.verify(token, JWT_SECRET) as { userId: string };
        if (!userId) throw new Error('Invalid token');

        // Configuración de eliminación
        const deleteParams = {
            TableName: USERS_TABLE,
            Key: {
                PK: `USER#${userId}`,
                SK: `CATEGORY#${categoryId}#PRODUCT#${productId}`
            }
        };

        // Elimina producto de DynamoDB
        await dynamoDb.delete(deleteParams).promise();
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Product deleted successfully' })
        };
    } catch (error) {
        // Manejo del tipo de error
        const errorMessage = (error as Error).message || 'Unknown error';
        console.error('Error in deleteProduct:', errorMessage);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Error deleting product', error: errorMessage })
        };
    }
};
