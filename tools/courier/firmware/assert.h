// assert.h for the Courier simulator: a failed assert() crashes the firmware (the run's report says
// so), as abort() does on the chip. Define NDEBUG to turn asserts off.
#undef assert
#ifdef NDEBUG
#define assert(x) ((void)0)
#else
#define assert(x) ((x) ? (void)0 : __builtin_trap())
#endif
