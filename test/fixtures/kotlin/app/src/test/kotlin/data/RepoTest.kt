class RepoTest {
    // spec: US-1; cat: data
    @Test
    fun savesAnImportedFile() {}

    // spec: US-1; cat: err
    @Ignore
    @Test
    fun aBrokenFileShowsAnError() {}

    // spec: US-2; cat: integ
    @Test fun `exports the report as CSV`() {}

    @BeforeTest
    fun setUp() {}
}
