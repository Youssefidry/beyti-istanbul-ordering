using Microsoft.Data.Sqlite;

public sealed class SiteSettingsStore(string connectionString)
{
    private const string DefaultTheme = "sufra";

    public async Task InitializeAsync()
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            CREATE TABLE IF NOT EXISTS SiteSettings (
                Id INTEGER PRIMARY KEY CHECK (Id = 1),
                Theme TEXT NOT NULL,
                SiteName TEXT NOT NULL DEFAULT 'سفرة',
                LogoData TEXT NULL
            );
            INSERT OR IGNORE INTO SiteSettings (Id, Theme) VALUES (1, $theme);
            """;
        command.Parameters.AddWithValue("$theme", DefaultTheme);
        await command.ExecuteNonQueryAsync();

        var hasSiteName = false;
        var hasLogoData = false;
        await using (var columns = connection.CreateCommand())
        {
            columns.CommandText = "PRAGMA table_info(SiteSettings);";
            await using var reader = await columns.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                var name = reader.GetString(1);
                if (name == "SiteName") hasSiteName = true;
                if (name == "LogoData") hasLogoData = true;
            }
        }

        if (!hasSiteName)
        {
            await using var migration = connection.CreateCommand();
            migration.CommandText = "ALTER TABLE SiteSettings ADD COLUMN SiteName TEXT NOT NULL DEFAULT 'سفرة';";
            await migration.ExecuteNonQueryAsync();
        }
        if (!hasLogoData)
        {
            await using var migration = connection.CreateCommand();
            migration.CommandText = "ALTER TABLE SiteSettings ADD COLUMN LogoData TEXT NULL;";
            await migration.ExecuteNonQueryAsync();
        }
    }

    public async Task<SiteSettings> GetAsync()
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT Theme, SiteName, LogoData FROM SiteSettings WHERE Id = 1;";
        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            throw new InvalidOperationException("The site settings row is missing.");
        }

        return new SiteSettings(
            reader.GetString(0),
            reader.GetString(1),
            reader.IsDBNull(2) ? null : reader.GetString(2));
    }

    public async Task UpdateAsync(string theme, string siteName, string? logoData, bool removeLogo)
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            UPDATE SiteSettings
            SET Theme = $theme,
                SiteName = $siteName,
                LogoData = CASE
                    WHEN $removeLogo = 1 THEN NULL
                    WHEN $logoData IS NOT NULL THEN $logoData
                    ELSE LogoData
                END
            WHERE Id = 1;
            """;
        command.Parameters.AddWithValue("$theme", theme);
        command.Parameters.AddWithValue("$siteName", siteName);
        command.Parameters.AddWithValue("$logoData", logoData is null ? DBNull.Value : logoData);
        command.Parameters.AddWithValue("$removeLogo", removeLogo ? 1 : 0);
        if (await command.ExecuteNonQueryAsync() != 1)
        {
            throw new InvalidOperationException("The site settings row is missing.");
        }
    }
}

public sealed record SiteSettings(string Theme, string SiteName, string? LogoData);
