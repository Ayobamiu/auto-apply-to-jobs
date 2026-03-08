import { diffWords } from 'diff';

export interface DiffChunk {
    value: string;
    added?: boolean;
    removed?: boolean;
}

export function getWordDiff(oldStr: string, newStr: string): DiffChunk[] {
    return diffWords(oldStr, newStr);
}