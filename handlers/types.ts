import { JwtPayload as DefaultJwtPayload } from 'jsonwebtoken';

export interface CustomJwtPayload extends DefaultJwtPayload {
    userId: string;
}

export interface Product {
    productName: string;
    price: number;
    description: string;
    productId: string;
    createdAt: string;
    categoryId: string; // Agregado
}

export interface Category {
    categoryName: string;
    SK: string;
    products: Product[];
}
