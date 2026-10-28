describe('test harness', () => {
  it('has IndexedDB', () => {
    expect(typeof indexedDB.open).toBe('function');
  });
});
