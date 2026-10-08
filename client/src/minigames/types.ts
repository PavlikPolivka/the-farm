/** A minigame's DOM board. The frame owns the clock, header and result; the board draws state. */
export interface Board<S> {
  el: HTMLElement;
  /** Redraw from the game state; `t` is ms since the start. Called every frame. */
  draw(s: S, t: number): void;
}

/** Sends a move to the session; returns whether the game accepted it. */
export type Send<M> = (m: M) => boolean;

export type Renderer<S, M> = (send: Send<M>, effects: Effects) => Board<S>;

export interface Effects {
  /** Small "+10" text that floats up from an element. */
  pop(el: HTMLElement, text: string, good?: boolean): void;
  buzz(ms?: number): void;
}
