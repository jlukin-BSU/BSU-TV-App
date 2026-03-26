import { registerPlugin } from "@capacitor/core";

export interface TvInputPlugin {
  switchInput(options: { port: number }): Promise<{
    success: boolean;
    inputId?: string;
    channelId?: number;
  }>;
  listInputs(): Promise<{
    inputs: Array<{ id: string; type: number; label: string }>;
  }>;
}

const TvInput = registerPlugin<TvInputPlugin>("TvInput");
export default TvInput;
