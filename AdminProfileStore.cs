using System.Security.Cryptography;
using Microsoft.Data.Sqlite;

public sealed class AdminProfileStore(string connectionString)
{
    public async Task InitializeAsync(string displayName, string initialPassword, int iterations)
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            CREATE TABLE IF NOT EXISTS AdminProfile (
                Id INTEGER PRIMARY KEY CHECK (Id = 1),
                DisplayName TEXT NOT NULL,
                AvatarData TEXT NULL,
                PasswordSalt BLOB NOT NULL,
                PasswordHash BLOB NOT NULL,
                PasswordIterations INTEGER NOT NULL,
                AuthVersion INTEGER NOT NULL DEFAULT 0
            );
            """;
        await command.ExecuteNonQueryAsync();

        var salt = RandomNumberGenerator.GetBytes(16);
        var hash = Rfc2898DeriveBytes.Pbkdf2(
            initialPassword,
            salt,
            iterations,
            HashAlgorithmName.SHA256,
            32);
        await using var seed = connection.CreateCommand();
        seed.CommandText = """
            INSERT OR IGNORE INTO AdminProfile
                (Id, DisplayName, PasswordSalt, PasswordHash, PasswordIterations, AuthVersion)
            VALUES (1, $displayName, $salt, $hash, $iterations, 0);
            """;
        seed.Parameters.AddWithValue("$displayName", displayName);
        seed.Parameters.AddWithValue("$salt", salt);
        seed.Parameters.AddWithValue("$hash", hash);
        seed.Parameters.AddWithValue("$iterations", iterations);
        await seed.ExecuteNonQueryAsync();
    }

    public async Task<AdminProfile> GetProfileAsync()
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT DisplayName, AvatarData FROM AdminProfile WHERE Id = 1;";
        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            throw new InvalidOperationException("The admin profile row is missing.");
        }

        return new AdminProfile(reader.GetString(0), reader.IsDBNull(1) ? null : reader.GetString(1));
    }

    public async Task<AdminCredentials> GetCredentialsAsync()
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT PasswordSalt, PasswordHash, PasswordIterations, AuthVersion
            FROM AdminProfile
            WHERE Id = 1;
            """;
        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            throw new InvalidOperationException("The admin credentials row is missing.");
        }

        return new AdminCredentials(
            reader.GetFieldValue<byte[]>(0),
            reader.GetFieldValue<byte[]>(1),
            reader.GetInt32(2),
            reader.GetInt32(3));
    }

    public async Task<bool> IsSessionValidAsync(int authVersion)
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT AuthVersion FROM AdminProfile WHERE Id = 1;";
        var storedVersion = await command.ExecuteScalarAsync();
        return storedVersion is long value && value == authVersion;
    }

    public async Task UpdateProfileAsync(string displayName, string? avatarData, bool removeAvatar)
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            UPDATE AdminProfile
            SET DisplayName = $displayName,
                AvatarData = CASE
                    WHEN $removeAvatar = 1 THEN NULL
                    WHEN $avatarData IS NOT NULL THEN $avatarData
                    ELSE AvatarData
                END
            WHERE Id = 1;
            """;
        command.Parameters.AddWithValue("$displayName", displayName);
        command.Parameters.AddWithValue("$avatarData", avatarData is null ? DBNull.Value : avatarData);
        command.Parameters.AddWithValue("$removeAvatar", removeAvatar ? 1 : 0);
        if (await command.ExecuteNonQueryAsync() != 1)
        {
            throw new InvalidOperationException("The admin profile row is missing.");
        }
    }

    public async Task ChangePasswordAsync(byte[] salt, byte[] hash, int iterations)
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            UPDATE AdminProfile
            SET PasswordSalt = $salt,
                PasswordHash = $hash,
                PasswordIterations = $iterations,
                AuthVersion = AuthVersion + 1
            WHERE Id = 1;
            """;
        command.Parameters.AddWithValue("$salt", salt);
        command.Parameters.AddWithValue("$hash", hash);
        command.Parameters.AddWithValue("$iterations", iterations);
        if (await command.ExecuteNonQueryAsync() != 1)
        {
            throw new InvalidOperationException("The admin credentials row is missing.");
        }
    }
}

public sealed record AdminProfile(string DisplayName, string? AvatarData);

public sealed record AdminCredentials(byte[] PasswordSalt, byte[] PasswordHash, int PasswordIterations, int AuthVersion);
