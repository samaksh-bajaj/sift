import { handle } from '../_shared/handler.ts';
Deno.serve(handle('interpret-query'));
