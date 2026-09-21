export {};
declare global {
    interface Window { mdDesktop?: { bridgeUrl?: string; openControls(): Promise<void> } }
}
