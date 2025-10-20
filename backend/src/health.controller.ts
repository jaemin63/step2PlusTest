import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('health')
  health() {
    return 'OK';
  }

  @Get('hello')
  hello() {
    return { ok: true, message: 'Hello from backend API!' };
  }
}
