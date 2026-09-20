import type { AdvancedBadSectorDecision } from '../../application/contracts';

export interface AdvancedBadSectorPrompt {
    address: string;
    count: number;
    seconds: number;
}

export interface AdvancedBadSectorChoice {
    decision: AdvancedBadSectorDecision;
    rememberForExport: boolean;
    rememberForSession: boolean;
}

export type AdvancedBadSectorPromptHandler = (prompt: AdvancedBadSectorPrompt) => Promise<AdvancedBadSectorChoice>;

export function createAdvancedBadSectorHandler(prompt: AdvancedBadSectorPromptHandler) {
    let rememberedDecision: AdvancedBadSectorDecision | null = null;
    return async (address: string, count: number, seconds: number) => {
        if (rememberedDecision) return rememberedDecision;
        const choice = await prompt({ address, count, seconds });
        if (choice.rememberForExport || choice.rememberForSession) rememberedDecision = choice.decision;
        return choice.decision;
    };
}

