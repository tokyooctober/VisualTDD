# spec: -; cat: input
def test_rejects_negative_numbers():
    pass

# cat: logic
@pytest.mark.parametrize("x", [1, 2])
def test_parsesTwoNumbers(x):
    pass

class TestThing:
    # cat: perf
    async def test_large_file(self):
        pass

def helper_not_a_test():
    pass
