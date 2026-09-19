import { createContext } from 'react';
import type { ApplicationClient } from '../application/application-client';

export const ApplicationClientContext = createContext<ApplicationClient | null>(null);
