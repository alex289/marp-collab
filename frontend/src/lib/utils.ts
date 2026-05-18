import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function throw404OnError<T extends (...args: any[]) => any>(func: T): T {
	return ((...args: any[]) => {
		try {
			return func(...args);
		} catch {
			throw new Error("404 Not Found");
		}
	}) as T;
}
