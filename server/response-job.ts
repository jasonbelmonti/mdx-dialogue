// Owns the background job after HTTP has acknowledged it. Failure persistence can fail too.
export async function settleResponse<T>(job: {
  run: () => Promise<T>;
  complete: (reply: T) => void;
  fail: (message: string) => void;
  release: () => void;
}) {
  try {
    job.complete(await job.run());
  } catch (error) {
    try {
      job.fail(error instanceof Error ? error.message : 'Model response failed.');
    } catch (saveError) {
      console.error('Could not record model failure; inspect saved request state.', saveError);
    }
  } finally {
    job.release();
  }
}
