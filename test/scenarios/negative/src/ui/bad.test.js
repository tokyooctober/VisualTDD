test('has no tag', () => {});

// spec: FR-2; cat: speed
test('unknown category', () => {});

// spec: FR-2; cat: ui; tier: cloud
test('unknown tier', () => {});

// spec: FR-9; cat: ui
test('unknown spec id', () => {});

// cat: ui
test('no spec id', () => {});

// spec: FR-2; cat: ui

test('tag above a blank line', () => {});

// spec: FR-2; cat: ui
const helper = () => {};
test('code between the tag and the test', () => {});

// spec: FR-1, FR-9; cat: ui
test('one good spec and one unknown spec', () => {});

// spec: FR-1; cat: ui
test('a good test among bad ones', () => {});
