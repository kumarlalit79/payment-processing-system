import { logger } from "../config/logger";

export enum CircuitState {
  CLOSED = "CLOSED",     // normal — requests ja rahe hain
  OPEN = "OPEN",         // gateway down — requests block
  HALF_OPEN = "HALF_OPEN", // test kar rahe hain — ek request allow
}

interface CircuitBreakerOptions {
  failureThreshold: number;   // kitne failures pe OPEN ho
  successThreshold: number;   // HALF_OPEN mein kitne success pe CLOSED ho
  timeout: number;            // OPEN ke baad kitne ms baad HALF_OPEN try karo
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime?: number;
  private readonly options: CircuitBreakerOptions;
  private readonly name: string;

  constructor(name: string, options?: Partial<CircuitBreakerOptions>) {
    this.name = name;
    this.options = {
      failureThreshold: options?.failureThreshold ?? 5,
      successThreshold: options?.successThreshold ?? 2,
      timeout: options?.timeout ?? 30000, // 30 seconds
    };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      const now = Date.now();
      const timeSinceFailure = now - (this.lastFailureTime ?? 0);

      if (timeSinceFailure < this.options.timeout) {
        logger.warn(`Circuit OPEN — request blocked`, { circuit: this.name });
        throw new Error(`Circuit breaker is OPEN for ${this.name}`);
      }

      // Its timout — go to HALF_OPEN 
      this.state = CircuitState.HALF_OPEN;
      logger.info(`Circuit HALF_OPEN — testing gateway`, { circuit: this.name });
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.successCount = 0;
        logger.info(`Circuit CLOSED — gateway recovered`, { circuit: this.name });
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      this.successCount = 0;
      logger.warn(`Circuit back to OPEN — gateway still failing`, { circuit: this.name });
      return;
    }

    if (this.failureCount >= this.options.failureThreshold) {
      this.state = CircuitState.OPEN;
      logger.error(`Circuit OPEN — too many failures`, {
        circuit: this.name,
        failures: this.failureCount,
      });
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}

// Singleton — poore app mein ek hi circuit breaker gateway ke liye
export const gatewayCircuitBreaker = new CircuitBreaker("payment-gateway", {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000,
});