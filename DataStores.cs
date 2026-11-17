using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Data.Sqlite;

public sealed class MenuStore(string connectionString)
{
    private static readonly JsonSerializerOptions MenuJsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly IReadOnlyList<MenuItem> DefaultItems =
    [
        new("chicken-shawarma", "شاورما دجاج", "دجاج متبل، ثوم، مخلل وبطاطا", "السندويشات", 320, "🌯", true),
        new("beef-burger", "برغر لحم", "لحم مشوي، جبن شيدر، خس وصلصة خاصة", "السندويشات", 450, "🍔", true),
        new("crispy-chicken", "دجاج مقرمش", "قطع دجاج مقرمشة مع صلصة البيت", "السندويشات", 390, "🍗", true),
        new("margherita", "بيتزا مارغريتا", "طماطم، موزاريلا وريحان طازج", "البيتزا", 600, "🍕", true),
        new("four-cheese", "بيتزا أربعة أجبان", "مزيج أجبان غني مع عجينة رقيقة", "البيتزا", 750, "🧀", true),
        new("fries", "بطاطا مقلية", "بطاطا ذهبية مع اختيار الصلصة", "المقبلات", 180, "🍟", true),
        new("salad", "سلطة طازجة", "خضار موسمية مع تتبيلة الليمون", "المقبلات", 220, "🥗", true),
        new("lemonade", "ليموناضة", "ليمون طازج ونعناع", "المشروبات", 150, "🍋", true),
        new("water", "ماء معدني", "قارورة 50 سل", "المشروبات", 80, "💧", true)
    ];

    public async Task InitializeAsync()
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            CREATE TABLE IF NOT EXISTS MenuItems (
                Id TEXT PRIMARY KEY,
                Name TEXT NOT NULL,
                Description TEXT NOT NULL,
                Category TEXT NOT NULL,
                Price INTEGER NOT NULL,
                Emoji TEXT NOT NULL,
                ImageData TEXT NULL,
                TranslationsJson TEXT NULL,
                BadgesJson TEXT NOT NULL DEFAULT '[]',
                IsAvailable INTEGER NOT NULL,
                IsDeleted INTEGER NOT NULL DEFAULT 0
            );
            """;
        await command.ExecuteNonQueryAsync();

        var hasImageData = false;
        var hasTranslationsJson = false;
        var hasBadgesJson = false;
        var hasIsDeleted = false;
        await using (var columns = connection.CreateCommand())
        {
            columns.CommandText = "PRAGMA table_info(MenuItems);";
            await using (var reader = await columns.ExecuteReaderAsync())
            {
                while (await reader.ReadAsync())
                {
                    var columnName = reader.GetString(1);
                    if (columnName == "ImageData") hasImageData = true;
                    if (columnName == "TranslationsJson") hasTranslationsJson = true;
                    if (columnName == "BadgesJson") hasBadgesJson = true;
                    if (columnName == "IsDeleted") hasIsDeleted = true;
                }
            }
        }
        if (!hasImageData)
        {
            await using var migration = connection.CreateCommand();
            migration.CommandText = "ALTER TABLE MenuItems ADD COLUMN ImageData TEXT NULL;";
            await migration.ExecuteNonQueryAsync();
        }
        if (!hasTranslationsJson)
        {
            await using var migration = connection.CreateCommand();
            migration.CommandText = "ALTER TABLE MenuItems ADD COLUMN TranslationsJson TEXT NULL;";
            await migration.ExecuteNonQueryAsync();
        }
        if (!hasBadgesJson)
        {
            await using var migration = connection.CreateCommand();
            migration.CommandText = "ALTER TABLE MenuItems ADD COLUMN BadgesJson TEXT NOT NULL DEFAULT '[]';";
            await migration.ExecuteNonQueryAsync();
        }
        if (!hasIsDeleted)
        {
            await using var migration = connection.CreateCommand();
            migration.CommandText = "ALTER TABLE MenuItems ADD COLUMN IsDeleted INTEGER NOT NULL DEFAULT 0;";
            await migration.ExecuteNonQueryAsync();
        }

        foreach (var item in DefaultItems)
        {
            await using var insert = connection.CreateCommand();
            insert.CommandText = """
                INSERT OR IGNORE INTO MenuItems (
                    Id, Name, Description, Category, Price, Emoji, ImageData, TranslationsJson, BadgesJson, IsAvailable)
                VALUES (
                    $id, $name, $description, $category, $price, $emoji, $imageData,
                    $translationsJson, $badgesJson, $isAvailable);
                """;
            AddMenuParameters(insert, item.Id, item.Name, item.Description, item.Category, item.Price, item.Emoji, null, null, "[]", true);
            await insert.ExecuteNonQueryAsync();
        }
    }

    public Task<IReadOnlyList<MenuItem>> GetAvailableAsync() => GetAsync(availableOnly: true);

    public Task<IReadOnlyList<MenuItem>> GetCustomerMenuAsync() => GetAsync(availableOnly: false);

    public Task<IReadOnlyList<MenuItem>> GetAllAsync() => GetAsync(availableOnly: false);

    public async Task<IReadOnlyDictionary<string, string>> GetImagesByIdsAsync(IEnumerable<string> itemIds)
    {
        var ids = itemIds.Distinct(StringComparer.Ordinal).ToArray();
        if (ids.Length == 0)
        {
            return new Dictionary<string, string>(StringComparer.Ordinal);
        }

        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        var parameters = ids.Select((_, index) => $"$id{index}").ToArray();
        command.CommandText = $"""
            SELECT Id, ImageData FROM MenuItems
            WHERE Id IN ({string.Join(", ", parameters)}) AND ImageData IS NOT NULL;
            """;
        for (var index = 0; index < ids.Length; index++)
        {
            command.Parameters.AddWithValue(parameters[index], ids[index]);
        }

        await using var reader = await command.ExecuteReaderAsync();
        var images = new Dictionary<string, string>(StringComparer.Ordinal);
        while (await reader.ReadAsync())
        {
            images.Add(reader.GetString(0), reader.GetString(1));
        }
        return images;
    }

    public async Task<MenuItem> CreateAsync(MenuItemRequest request)
    {
        var item = new MenuItem(
            $"dish-{Guid.NewGuid():N}",
            request.Name!.Trim(),
            request.Description?.Trim() ?? "",
            request.Category!.Trim(),
            request.Price,
            "🍽",
            request.IsAvailable,
            request.ImageData,
            request.Translations,
            request.Badges ?? []);
        var translationsJson = request.Translations is null
            ? null
            : JsonSerializer.Serialize(request.Translations, MenuJsonOptions);
        var badgesJson = JsonSerializer.Serialize(request.Badges ?? [], MenuJsonOptions);
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO MenuItems (
                Id, Name, Description, Category, Price, Emoji, ImageData, TranslationsJson, BadgesJson, IsAvailable)
            VALUES (
                $id, $name, $description, $category, $price, $emoji, $imageData,
                $translationsJson, $badgesJson, $isAvailable);
            """;
        AddMenuParameters(
            command, item.Id, item.Name, item.Description, item.Category, item.Price, item.Emoji,
            item.ImageData, translationsJson, badgesJson, item.IsAvailable);
        await command.ExecuteNonQueryAsync();
        return item;
    }

    public async Task<MenuItem?> UpdateAsync(string id, MenuItemRequest request)
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            UPDATE MenuItems SET Name = $name, Description = $description, Category = $category,
                Price = $price, ImageData = COALESCE($imageData, ImageData),
                TranslationsJson = $translationsJson, BadgesJson = $badgesJson, IsAvailable = $isAvailable
            WHERE Id = $id AND IsDeleted = 0;
            """;
        var translationsJson = request.Translations is null
            ? null
            : JsonSerializer.Serialize(request.Translations, MenuJsonOptions);
        var badgesJson = JsonSerializer.Serialize(request.Badges ?? [], MenuJsonOptions);
        AddMenuParameters(
            command,
            id,
            request.Name!.Trim(),
            request.Description?.Trim() ?? "",
            request.Category!.Trim(),
            request.Price,
            "🍽",
            request.ImageData,
            translationsJson,
            badgesJson,
            request.IsAvailable);
        if (await command.ExecuteNonQueryAsync() == 0)
        {
            return null;
        }

        return await GetByIdAsync(id);
    }

    public async Task<bool> SetAvailabilityAsync(string id, bool isAvailable)
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "UPDATE MenuItems SET IsAvailable = $isAvailable WHERE Id = $id AND IsDeleted = 0;";
        command.Parameters.AddWithValue("$isAvailable", isAvailable ? 1 : 0);
        command.Parameters.AddWithValue("$id", id);
        return await command.ExecuteNonQueryAsync() == 1;
    }

    public async Task<bool> DeleteAsync(string id)
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "UPDATE MenuItems SET IsDeleted = 1, IsAvailable = 0 WHERE Id = $id AND IsDeleted = 0;";
        command.Parameters.AddWithValue("$id", id);
        return await command.ExecuteNonQueryAsync() == 1;
    }

    private async Task<IReadOnlyList<MenuItem>> GetAsync(bool availableOnly)
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT Id, Name, Description, Category, Price, Emoji, ImageData, IsAvailable,
                TranslationsJson, BadgesJson
            FROM MenuItems
            WHERE IsDeleted = 0 AND ($availableOnly = 0 OR IsAvailable = 1)
            ORDER BY Category, Name;
            """;
        command.Parameters.AddWithValue("$availableOnly", availableOnly ? 1 : 0);
        await using var reader = await command.ExecuteReaderAsync();
        var items = new List<MenuItem>();
        while (await reader.ReadAsync())
        {
            items.Add(ReadMenuItem(reader));
        }
        return items;
    }

    private static MenuItem ReadMenuItem(SqliteDataReader reader)
    {
        var name = reader.GetString(1);
        var description = reader.GetString(2);
        var category = reader.GetString(3);
        var translations = reader.IsDBNull(8)
            ? CreateLegacyTranslations(name, description, category)
            : JsonSerializer.Deserialize<MenuTranslations>(reader.GetString(8), MenuJsonOptions);
        var badges = JsonSerializer.Deserialize<string[]>(reader.GetString(9), MenuJsonOptions) ?? [];
        return new MenuItem(
            reader.GetString(0), name, description, category, reader.GetInt32(4), reader.GetString(5),
            reader.GetInt32(7) == 1, reader.IsDBNull(6) ? null : reader.GetString(6), translations, badges);
    }

    private static MenuTranslations? CreateLegacyTranslations(string name, string description, string category)
    {
        var translations = name switch
        {
            "Haydari" => new MenuTranslations(
                new("هايداري", "مقبلات تركية من اللبن مع الباذنجان المشوي على الحطب والمفروم.", "مقبلات", "اسأل فريقنا عن مسببات الحساسية."),
                new("Haydari", description, "Mezzes", "Demandez à notre équipe pour les allergènes."),
                new("Haydari", "Turkish yogurt mezze with wood-grilled, chopped eggplant.", "Mezze", "Ask our team about allergens.")),
            "Cesar Poulet" => new MenuTranslations(
                new("سلطة سيزر بالدجاج", "سلطة سيزر كلاسيكية مع قطع الدجاج المشوي، والخبز المحمّص، ورقائق البارميزان.", "سلطات", "اسأل فريقنا عن مسببات الحساسية."),
                new("Salade César au poulet", description, "Salades", "Demandez à notre équipe pour les allergènes."),
                new("Chicken Caesar Salad", "Classic Caesar salad with tender grilled chicken, croutons, and shaved Parmesan.", "Salads", "Ask our team about allergens.")),
            "La Gambas Avocat" => new MenuTranslations(
                new("سلطة الروبيان والأفوكادو", "سلطة طازجة وخفيفة تجمع بين الروبيان والأفوكادو الكريمي.", "سلطات", "اسأل فريقنا عن مسببات الحساسية."),
                new("Salade gambas avocat", description, "Salades", "Demandez à notre équipe pour les allergènes."),
                new("Prawn and Avocado Salad", "A fresh, light salad with delicious prawns and creamy avocado.", "Salads", "Ask our team about allergens.")),
            "Frite Maison" => new MenuTranslations(
                new("بطاطا مقلية منزلية", "بطاطا مقلية مقرمشة محضّرة في المطعم، مناسبة لمرافقة أطباقك.", "أطباق جانبية", "اسأل فريقنا عن مسببات الحساسية."),
                new("Frites maison", description, "Accompagnements", "Demandez à notre équipe pour les allergènes."),
                new("Homemade Fries", "Crispy house-made fries, a classic side for any meal.", "Side Dishes", "Ask our team about allergens.")),
            "Riz Oriental" => new MenuTranslations(
                new("أرز شرقي", "أرز شرقي متبّل ولذيذ، إضافة مثالية لإكمال وجبتك.", "أطباق جانبية", "اسأل فريقنا عن مسببات الحساسية."),
                new("Riz oriental", description, "Accompagnements", "Demandez à notre équipe pour les allergènes."),
                new("Oriental Rice", "A fragrant, flavorful Oriental rice side to complete your meal.", "Side Dishes", "Ask our team about allergens.")),
            _ => null
        };
        return translations;
    }

    private async Task<MenuItem?> GetByIdAsync(string id)
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT Id, Name, Description, Category, Price, Emoji, ImageData, IsAvailable,
                TranslationsJson, BadgesJson
            FROM MenuItems
            WHERE Id = $id AND IsDeleted = 0;
            """;
        command.Parameters.AddWithValue("$id", id);
        await using var reader = await command.ExecuteReaderAsync();
        return await reader.ReadAsync() ? ReadMenuItem(reader) : null;
    }

    private static void AddMenuParameters(
        SqliteCommand command,
        string id,
        string name,
        string description,
        string category,
        int price,
        string emoji,
        string? imageData,
        string? translationsJson,
        string badgesJson,
        bool isAvailable)
    {
        command.Parameters.AddWithValue("$id", id);
        command.Parameters.AddWithValue("$name", name);
        command.Parameters.AddWithValue("$description", description);
        command.Parameters.AddWithValue("$category", category);
        command.Parameters.AddWithValue("$price", price);
        command.Parameters.AddWithValue("$emoji", emoji);
        command.Parameters.AddWithValue("$imageData", imageData is null ? DBNull.Value : imageData);
        command.Parameters.AddWithValue("$translationsJson", translationsJson is null ? DBNull.Value : translationsJson);
        command.Parameters.AddWithValue("$badgesJson", badgesJson);
        command.Parameters.AddWithValue("$isAvailable", isAvailable ? 1 : 0);
    }
}

public sealed class TableRequestStore(string connectionString)
{
    public async Task InitializeAsync()
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            CREATE TABLE IF NOT EXISTS TableRequests (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                TableNumber INTEGER NOT NULL,
                Type TEXT NOT NULL,
                CreatedAt TEXT NOT NULL,
                IsCompleted INTEGER NOT NULL DEFAULT 0
            );
            CREATE UNIQUE INDEX IF NOT EXISTS IX_TableRequests_Pending
                ON TableRequests (TableNumber, Type) WHERE IsCompleted = 0;
            """;
        await command.ExecuteNonQueryAsync();
    }

    public async Task<bool> CreateAsync(int tableNumber, string type)
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO TableRequests (TableNumber, Type, CreatedAt)
            VALUES ($tableNumber, $type, $createdAt);
            """;
        command.Parameters.AddWithValue("$tableNumber", tableNumber);
        command.Parameters.AddWithValue("$type", type);
        command.Parameters.AddWithValue("$createdAt", DateTimeOffset.UtcNow.ToString("O"));
        try
        {
            return await command.ExecuteNonQueryAsync() == 1;
        }
        catch (SqliteException exception) when (exception.SqliteExtendedErrorCode == 2067)
        {
            return false;
        }
    }

    public async Task<IReadOnlyList<TableServiceRequest>> GetPendingAsync()
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT Id, TableNumber, Type, CreatedAt
            FROM TableRequests WHERE IsCompleted = 0
            ORDER BY CreatedAt, Id;
            """;
        await using var reader = await command.ExecuteReaderAsync();
        var requests = new List<TableServiceRequest>();
        while (await reader.ReadAsync())
        {
            requests.Add(new TableServiceRequest(
                reader.GetInt64(0),
                reader.GetInt32(1),
                reader.GetString(2),
                DateTimeOffset.Parse(reader.GetString(3))));
        }
        return requests;
    }

    public async Task<bool> CompleteAsync(long id)
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "UPDATE TableRequests SET IsCompleted = 1 WHERE Id = $id AND IsCompleted = 0;";
        command.Parameters.AddWithValue("$id", id);
        return await command.ExecuteNonQueryAsync() == 1;
    }
}

public sealed class StaffAccountStore(string connectionString)
{
    private const int HashIterations = 150_000;

    public async Task InitializeAsync()
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            CREATE TABLE IF NOT EXISTS StaffAccounts (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                Name TEXT NOT NULL,
                PinHash TEXT NOT NULL,
                IsActive INTEGER NOT NULL,
                CreatedAt TEXT NOT NULL,
                AuthVersion INTEGER NOT NULL DEFAULT 1,
                AvatarData TEXT NULL
            );
            """;
        await command.ExecuteNonQueryAsync();

        var hasAvatarData = false;
        await using (var columns = connection.CreateCommand())
        {
            columns.CommandText = "PRAGMA table_info(StaffAccounts);";
            await using var reader = await columns.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                if (reader.GetString(1) == "AvatarData") hasAvatarData = true;
            }
        }
        if (!hasAvatarData)
        {
            await using var migration = connection.CreateCommand();
            migration.CommandText = "ALTER TABLE StaffAccounts ADD COLUMN AvatarData TEXT NULL;";
            await migration.ExecuteNonQueryAsync();
        }
    }

    public async Task SeedIfEmptyAsync(string name, string pin)
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var count = connection.CreateCommand();
        count.CommandText = "SELECT COUNT(*) FROM StaffAccounts;";
        if (Convert.ToInt64(await count.ExecuteScalarAsync()) > 0)
        {
            return;
        }

        await CreateAsync(name, pin);
    }

    public async Task<StaffIdentity?> FindActiveByPinAsync(string pin)
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT Id, Name, PinHash, AuthVersion FROM StaffAccounts WHERE IsActive = 1 ORDER BY Id;";
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            if (VerifyPin(pin, reader.GetString(2)))
            {
                return new StaffIdentity(reader.GetInt64(0), reader.GetString(1), reader.GetInt32(3));
            }
        }
        return null;
    }

    public async Task<StaffProfile?> GetProfileAsync(long id)
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT Name, AvatarData
            FROM StaffAccounts
            WHERE Id = $id AND IsActive = 1;
            """;
        command.Parameters.AddWithValue("$id", id);
        await using var reader = await command.ExecuteReaderAsync();
        return await reader.ReadAsync()
            ? new StaffProfile(reader.GetString(0), reader.IsDBNull(1) ? null : reader.GetString(1))
            : null;
    }

    public async Task<StaffProfile?> UpdateProfileAsync(long id, string name, string? avatarData, bool removeAvatar)
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            UPDATE StaffAccounts
            SET Name = $name,
                AvatarData = CASE
                    WHEN $removeAvatar = 1 THEN NULL
                    WHEN $avatarData IS NOT NULL THEN $avatarData
                    ELSE AvatarData
                END
            WHERE Id = $id AND IsActive = 1;
            """;
        command.Parameters.AddWithValue("$id", id);
        command.Parameters.AddWithValue("$name", name);
        command.Parameters.AddWithValue("$avatarData", avatarData is null ? DBNull.Value : avatarData);
        command.Parameters.AddWithValue("$removeAvatar", removeAvatar ? 1 : 0);
        if (await command.ExecuteNonQueryAsync() != 1)
        {
            return null;
        }

        return await GetProfileAsync(id);
    }

    public async Task<StaffPinChangeResult> ChangePinAsync(long id, string currentPin, string newPin)
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        using var transaction = connection.BeginTransaction();

        await using var current = connection.CreateCommand();
        current.Transaction = transaction;
        current.CommandText = "SELECT PinHash, IsActive FROM StaffAccounts WHERE Id = $id;";
        current.Parameters.AddWithValue("$id", id);
        string storedHash;
        bool isActive;
        await using (var reader = await current.ExecuteReaderAsync())
        {
            if (!await reader.ReadAsync())
            {
                return StaffPinChangeResult.NotFound;
            }
            storedHash = reader.GetString(0);
            isActive = reader.GetInt32(1) == 1;
        }
        if (!isActive)
        {
            return StaffPinChangeResult.Inactive;
        }
        if (!VerifyPin(currentPin, storedHash))
        {
            return StaffPinChangeResult.InvalidCurrentPin;
        }

        await using var pins = connection.CreateCommand();
        pins.Transaction = transaction;
        pins.CommandText = "SELECT PinHash FROM StaffAccounts WHERE Id != $id;";
        pins.Parameters.AddWithValue("$id", id);
        await using (var pinReader = await pins.ExecuteReaderAsync())
        {
            while (await pinReader.ReadAsync())
            {
                if (VerifyPin(newPin, pinReader.GetString(0)))
                {
                    return StaffPinChangeResult.PinAlreadyUsed;
                }
            }
        }

        await using var update = connection.CreateCommand();
        update.Transaction = transaction;
        update.CommandText = """
            UPDATE StaffAccounts
            SET PinHash = $pinHash,
                AuthVersion = AuthVersion + 1
            WHERE Id = $id AND IsActive = 1;
            """;
        update.Parameters.AddWithValue("$id", id);
        update.Parameters.AddWithValue("$pinHash", HashPin(newPin));
        if (await update.ExecuteNonQueryAsync() != 1)
        {
            return StaffPinChangeResult.Inactive;
        }

        await transaction.CommitAsync();
        return StaffPinChangeResult.Changed;
    }

    public async Task<bool> IsPinTakenAsync(string pin, long? excludedId = null)
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = excludedId is null
            ? "SELECT PinHash FROM StaffAccounts;"
            : "SELECT PinHash FROM StaffAccounts WHERE Id != $excludedId;";
        if (excludedId is not null)
        {
            command.Parameters.AddWithValue("$excludedId", excludedId.Value);
        }
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            if (VerifyPin(pin, reader.GetString(0)))
            {
                return true;
            }
        }
        return false;
    }

    public async Task<IReadOnlyList<StaffSummary>> GetAllAsync()
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT Id, Name, IsActive, CreatedAt FROM StaffAccounts ORDER BY Id DESC;";
        await using var reader = await command.ExecuteReaderAsync();
        var staff = new List<StaffSummary>();
        while (await reader.ReadAsync())
        {
            staff.Add(ReadSummary(reader));
        }
        return staff;
    }

    public async Task<StaffSummary> CreateAsync(string name, string pin)
    {
        var createdAt = DateTimeOffset.UtcNow;
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO StaffAccounts (Name, PinHash, IsActive, CreatedAt)
            VALUES ($name, $pinHash, 1, $createdAt);
            SELECT last_insert_rowid();
            """;
        command.Parameters.AddWithValue("$name", name);
        command.Parameters.AddWithValue("$pinHash", HashPin(pin));
        command.Parameters.AddWithValue("$createdAt", createdAt.ToString("O"));
        var id = (long)(await command.ExecuteScalarAsync() ?? throw new InvalidOperationException("Staff insert failed."));
        return new StaffSummary(id, name, true, createdAt);
    }

    public async Task<StaffSummary?> UpdateAsync(long id, string name, bool isActive, string? newPin)
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            UPDATE StaffAccounts
            SET Name = $name,
                IsActive = $isActive,
                PinHash = COALESCE($pinHash, PinHash),
                AuthVersion = CASE
                    WHEN IsActive != $isActive OR $pinHash IS NOT NULL THEN AuthVersion + 1
                    ELSE AuthVersion
                END
            WHERE Id = $id;
            """;
        command.Parameters.AddWithValue("$id", id);
        command.Parameters.AddWithValue("$name", name);
        command.Parameters.AddWithValue("$isActive", isActive ? 1 : 0);
        command.Parameters.AddWithValue("$pinHash", newPin is null ? DBNull.Value : HashPin(newPin));
        if (await command.ExecuteNonQueryAsync() == 0)
        {
            return null;
        }

        await using var get = connection.CreateCommand();
        get.CommandText = "SELECT Id, Name, IsActive, CreatedAt FROM StaffAccounts WHERE Id = $id;";
        get.Parameters.AddWithValue("$id", id);
        await using var reader = await get.ExecuteReaderAsync();
        return await reader.ReadAsync() ? ReadSummary(reader) : null;
    }

    public async Task<bool> SetActiveAsync(long id, bool isActive)
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            UPDATE StaffAccounts SET IsActive = $isActive, AuthVersion = AuthVersion + 1
            WHERE Id = $id AND IsActive != $isActive;
            """;
        command.Parameters.AddWithValue("$id", id);
        command.Parameters.AddWithValue("$isActive", isActive ? 1 : 0);
        if (await command.ExecuteNonQueryAsync() > 0)
        {
            return true;
        }

        await using var exists = connection.CreateCommand();
        exists.CommandText = "SELECT 1 FROM StaffAccounts WHERE Id = $id;";
        exists.Parameters.AddWithValue("$id", id);
        return await exists.ExecuteScalarAsync() is not null;
    }

    public async Task<bool> IsSessionValidAsync(long id, int authVersion)
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT 1 FROM StaffAccounts WHERE Id = $id AND IsActive = 1 AND AuthVersion = $authVersion;";
        command.Parameters.AddWithValue("$id", id);
        command.Parameters.AddWithValue("$authVersion", authVersion);
        return await command.ExecuteScalarAsync() is not null;
    }

    private static StaffSummary ReadSummary(SqliteDataReader reader) =>
        new(reader.GetInt64(0), reader.GetString(1), reader.GetInt32(2) == 1, DateTimeOffset.Parse(reader.GetString(3)));

    private static string HashPin(string pin)
    {
        var salt = RandomNumberGenerator.GetBytes(16);
        var hash = Rfc2898DeriveBytes.Pbkdf2(pin, salt, HashIterations, HashAlgorithmName.SHA256, 32);
        return $"{Convert.ToBase64String(salt)}.{Convert.ToBase64String(hash)}";
    }

    private static bool VerifyPin(string pin, string storedHash)
    {
        var parts = storedHash.Split('.', 2);
        if (parts.Length != 2)
        {
            return false;
        }

        try
        {
            var salt = Convert.FromBase64String(parts[0]);
            var expected = Convert.FromBase64String(parts[1]);
            var actual = Rfc2898DeriveBytes.Pbkdf2(pin, salt, HashIterations, HashAlgorithmName.SHA256, expected.Length);
            return CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch (FormatException)
        {
            return false;
        }
    }
}

public sealed record StaffProfile(string Name, string? AvatarData);

public enum StaffPinChangeResult
{
    Changed,
    InvalidCurrentPin,
    PinAlreadyUsed,
    Inactive,
    NotFound
}

public sealed class OrderStore(string connectionString)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private const string OrderCodeAlphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

    public async Task InitializeAsync()
    {
        var directory = Path.GetDirectoryName(new SqliteConnectionStringBuilder(connectionString).DataSource);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }

        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            CREATE TABLE IF NOT EXISTS Orders (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                Token TEXT NOT NULL UNIQUE,
                OrderCode TEXT NULL,
                CustomerName TEXT NOT NULL,
                TableNumber INTEGER NOT NULL,
                Notes TEXT NULL,
                ItemsJson TEXT NOT NULL,
                Total INTEGER NOT NULL,
                Status TEXT NOT NULL,
                CreatedAt TEXT NOT NULL,
                ConfirmedAt TEXT NULL
            );
            """;
        await command.ExecuteNonQueryAsync();

        var hasConfirmedByStaffId = false;
        var hasConfirmedByStaffName = false;
        var hasOrderCode = false;
        var hasNotes = false;
        await using (var columns = connection.CreateCommand())
        {
            columns.CommandText = "PRAGMA table_info(Orders);";
            await using var reader = await columns.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                var columnName = reader.GetString(1);
                if (columnName == "ConfirmedByStaffId") hasConfirmedByStaffId = true;
                if (columnName == "ConfirmedByStaffName") hasConfirmedByStaffName = true;
                if (columnName == "OrderCode") hasOrderCode = true;
                if (columnName == "Notes") hasNotes = true;
            }
        }

        if (!hasConfirmedByStaffId)
        {
            await using var migration = connection.CreateCommand();
            migration.CommandText = "ALTER TABLE Orders ADD COLUMN ConfirmedByStaffId INTEGER NULL;";
            await migration.ExecuteNonQueryAsync();
        }
        if (!hasConfirmedByStaffName)
        {
            await using var migration = connection.CreateCommand();
            migration.CommandText = "ALTER TABLE Orders ADD COLUMN ConfirmedByStaffName TEXT NULL;";
            await migration.ExecuteNonQueryAsync();
        }
        if (!hasOrderCode)
        {
            await using var migration = connection.CreateCommand();
            migration.CommandText = "ALTER TABLE Orders ADD COLUMN OrderCode TEXT NULL;";
            await migration.ExecuteNonQueryAsync();
        }
        if (!hasNotes)
        {
            await using var migration = connection.CreateCommand();
            migration.CommandText = "ALTER TABLE Orders ADD COLUMN Notes TEXT NULL;";
            await migration.ExecuteNonQueryAsync();
        }

        await using var indexes = connection.CreateCommand();
        indexes.CommandText = """
            CREATE INDEX IF NOT EXISTS IX_Orders_Status_ConfirmedAt ON Orders (Status, ConfirmedAt);
            CREATE INDEX IF NOT EXISTS IX_Orders_ConfirmedByStaffId_ConfirmedAt
                ON Orders (ConfirmedByStaffId, ConfirmedAt);
            CREATE UNIQUE INDEX IF NOT EXISTS IX_Orders_OrderCode
                ON Orders (OrderCode) WHERE OrderCode IS NOT NULL;
            """;
        await indexes.ExecuteNonQueryAsync();
    }

    public async Task<OrderDetails?> CreateAsync(
        string customerName,
        int? tableNumber,
        IReadOnlyList<OrderItemRequest> requestedItems,
        string? notes)
    {
        var groupedItems = requestedItems.GroupBy(item => item.Id, StringComparer.Ordinal).ToArray();
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        var availableItems = new Dictionary<string, MenuItem>(StringComparer.Ordinal);
        foreach (var group in groupedItems)
        {
            await using var lookup = connection.CreateCommand();
            lookup.CommandText = """
                SELECT Id, Name, Description, Category, Price, Emoji, IsAvailable
                FROM MenuItems WHERE Id = $id AND IsAvailable = 1;
                """;
            lookup.Parameters.AddWithValue("$id", group.Key);
            await using var reader = await lookup.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
            {
                return null;
            }
            availableItems[group.Key] = new MenuItem(
                reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3),
                reader.GetInt32(4), reader.GetString(5), reader.GetInt32(6) == 1);
        }

        var lines = groupedItems.Select(group =>
        {
            var menuItem = availableItems[group.Key];
            var quantity = group.Sum(item => item.Quantity);
            return new OrderLine(
                menuItem.Id,
                menuItem.Name,
                quantity,
                menuItem.Price,
                menuItem.Price * quantity,
                null,
                group.Select(item => item.Notes?.Trim()).FirstOrDefault(note => !string.IsNullOrEmpty(note)));
        }).ToArray();
        var total = lines.Sum(line => line.Subtotal);
        var createdAt = DateTimeOffset.UtcNow;

        for (var attempt = 0; attempt < 5; attempt++)
        {
            var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
                .TrimEnd('=')
                .Replace('+', '-')
                .Replace('/', '_');
            var code = GenerateOrderCode();
            await using var command = connection.CreateCommand();
            command.CommandText = """
                INSERT INTO Orders (
                    Token, OrderCode, CustomerName, TableNumber, Notes, ItemsJson, Total, Status, CreatedAt)
                VALUES (
                    $token, $orderCode, $customerName, $tableNumber, $notes, $items, $total, 'pending', $createdAt);
                SELECT last_insert_rowid();
                """;
            command.Parameters.AddWithValue("$token", token);
            command.Parameters.AddWithValue("$orderCode", code);
            command.Parameters.AddWithValue("$customerName", customerName);
            command.Parameters.AddWithValue("$tableNumber", tableNumber ?? 0);
            command.Parameters.AddWithValue("$notes", notes is null ? DBNull.Value : notes);
            command.Parameters.AddWithValue("$items", JsonSerializer.Serialize(lines, JsonOptions));
            command.Parameters.AddWithValue("$total", total);
            command.Parameters.AddWithValue("$createdAt", createdAt.ToString("O"));

            try
            {
                var id = (long)(await command.ExecuteScalarAsync() ?? throw new InvalidOperationException("Order insert failed."));
                return new OrderDetails(id, token, code, customerName, tableNumber, lines, total, "pending", createdAt, null, notes);
            }
            catch (SqliteException exception) when (exception.SqliteExtendedErrorCode == 2067 && attempt < 4)
            {
                continue;
            }
        }

        throw new InvalidOperationException("Failed to generate a unique order code.");
    }

    public async Task<OrderDetails?> GetByTokenAsync(string token)
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT Id, Token, CustomerName, TableNumber, ItemsJson, Total, Status, CreatedAt,
                ConfirmedAt, OrderCode, Notes
            FROM Orders WHERE Token = $token;
            """;
        command.Parameters.AddWithValue("$token", token);
        await using var reader = await command.ExecuteReaderAsync();
        return await reader.ReadAsync() ? ReadOrder(reader) : null;
    }

    public async Task<OrderDetails?> GetByCodeAsync(string code)
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT Id, Token, CustomerName, TableNumber, ItemsJson, Total, Status, CreatedAt,
                ConfirmedAt, OrderCode, Notes
            FROM Orders WHERE OrderCode = $code;
            """;
        command.Parameters.AddWithValue("$code", code);
        await using var reader = await command.ExecuteReaderAsync();
        return await reader.ReadAsync() ? ReadOrder(reader) : null;
    }

    public static bool IsValidOrderCode(string? code) =>
        code is { Length: 8 } &&
        code.All(character => OrderCodeAlphabet.Contains(char.ToUpperInvariant(character)));

    public async Task<IReadOnlyList<AdminOrderSummary>> GetConfirmedAsync(
        DateTimeOffset? from,
        DateTimeOffset? to,
        long? staffId)
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT Id, CustomerName, TableNumber, ItemsJson, Total, CreatedAt, ConfirmedAt,
                ConfirmedByStaffName, Notes
            FROM Orders
            WHERE Status = 'confirmed'
                AND ($from IS NULL OR ConfirmedAt >= $from)
                AND ($to IS NULL OR ConfirmedAt < $to)
                AND ($staffId IS NULL OR ConfirmedByStaffId = $staffId)
            ORDER BY ConfirmedAt DESC, Id DESC;
            """;
        command.Parameters.AddWithValue("$from", (object?)from?.ToUniversalTime().ToString("O") ?? DBNull.Value);
        command.Parameters.AddWithValue("$to", (object?)to?.ToUniversalTime().ToString("O") ?? DBNull.Value);
        command.Parameters.AddWithValue("$staffId", (object?)staffId ?? DBNull.Value);
        await using var reader = await command.ExecuteReaderAsync();
        var orders = new List<AdminOrderSummary>();
        while (await reader.ReadAsync())
        {
            orders.Add(ReadConfirmedOrder(reader));
        }
        return orders;
    }

    public async Task<AdminOrderSummary?> GetConfirmedByIdAsync(long id)
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT Id, CustomerName, TableNumber, ItemsJson, Total, CreatedAt, ConfirmedAt,
                ConfirmedByStaffName, Notes
            FROM Orders
            WHERE Id = $id AND Status = 'confirmed';
            """;
        command.Parameters.AddWithValue("$id", id);
        await using var reader = await command.ExecuteReaderAsync();
        return await reader.ReadAsync() ? ReadConfirmedOrder(reader) : null;
    }

    public async Task<AdminOrderStats> GetStatsAsync(DateTimeOffset from, DateTimeOffset to)
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();

        await using var totals = connection.CreateCommand();
        totals.CommandText = """
            SELECT COUNT(*), COALESCE(SUM(Total), 0),
                COALESCE(SUM(CASE WHEN ConfirmedByStaffId IS NULL THEN 1 ELSE 0 END), 0)
            FROM Orders
            WHERE Status = 'confirmed' AND ConfirmedAt >= $from AND ConfirmedAt < $to;
            """;
        totals.Parameters.AddWithValue("$from", from.ToUniversalTime().ToString("O"));
        totals.Parameters.AddWithValue("$to", to.ToUniversalTime().ToString("O"));
        await using var totalReader = await totals.ExecuteReaderAsync();
        if (!await totalReader.ReadAsync())
        {
            throw new InvalidOperationException("Failed to load order statistics.");
        }
        var completedOrders = totalReader.GetInt32(0);
        var revenue = totalReader.GetInt32(1);
        var unattributedOrders = totalReader.GetInt32(2);
        await totalReader.DisposeAsync();

        await using var employeesCommand = connection.CreateCommand();
        employeesCommand.CommandText = """
            SELECT StaffAccounts.Id, StaffAccounts.Name, StaffAccounts.IsActive,
                COUNT(Orders.Id), COALESCE(SUM(Orders.Total), 0)
            FROM StaffAccounts
            LEFT JOIN Orders
                ON Orders.ConfirmedByStaffId = StaffAccounts.Id
                AND Orders.Status = 'confirmed'
                AND Orders.ConfirmedAt >= $from
                AND Orders.ConfirmedAt < $to
            GROUP BY StaffAccounts.Id, StaffAccounts.Name, StaffAccounts.IsActive
            ORDER BY COUNT(Orders.Id) DESC, StaffAccounts.Name COLLATE NOCASE;
            """;
        employeesCommand.Parameters.AddWithValue("$from", from.ToUniversalTime().ToString("O"));
        employeesCommand.Parameters.AddWithValue("$to", to.ToUniversalTime().ToString("O"));
        await using var employeeReader = await employeesCommand.ExecuteReaderAsync();
        var employees = new List<StaffOrderStats>();
        while (await employeeReader.ReadAsync())
        {
            employees.Add(new StaffOrderStats(
                employeeReader.GetInt64(0),
                employeeReader.GetString(1),
                employeeReader.GetInt32(2) == 1,
                employeeReader.GetInt32(3),
                employeeReader.GetInt32(4)));
        }

        return new AdminOrderStats(completedOrders, revenue, unattributedOrders, employees);
    }

    public async Task<ConfirmResult> ConfirmAsync(string token, long staffId, string staffName)
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            UPDATE Orders
            SET Status = 'confirmed', ConfirmedAt = $confirmedAt,
                ConfirmedByStaffId = $staffId, ConfirmedByStaffName = $staffName
            WHERE Token = $token AND Status = 'pending';
            """;
        command.Parameters.AddWithValue("$token", token);
        command.Parameters.AddWithValue("$confirmedAt", DateTimeOffset.UtcNow.ToString("O"));
        command.Parameters.AddWithValue("$staffId", staffId);
        command.Parameters.AddWithValue("$staffName", staffName);
        if (await command.ExecuteNonQueryAsync() == 1)
        {
            return ConfirmResult.Confirmed;
        }

        var existing = await GetByTokenAsync(token);
        return existing is null ? ConfirmResult.NotFound : ConfirmResult.AlreadyConfirmed;
    }

    private static OrderDetails ReadOrder(SqliteDataReader reader)
    {
        var storedTableNumber = reader.GetInt32(3);
        var confirmedAtValue = reader.IsDBNull(8) ? null : reader.GetString(8);
        return new OrderDetails(
            reader.GetInt64(0),
            reader.GetString(1),
            reader.IsDBNull(9) ? null : reader.GetString(9),
            reader.GetString(2),
            storedTableNumber == 0 ? null : storedTableNumber,
            JsonSerializer.Deserialize<OrderLine[]>(reader.GetString(4), JsonOptions) ?? [],
            reader.GetInt32(5),
            reader.GetString(6),
            DateTimeOffset.Parse(reader.GetString(7)),
            confirmedAtValue is null ? null : DateTimeOffset.Parse(confirmedAtValue),
            reader.IsDBNull(10) ? null : reader.GetString(10));
    }

    private static string GenerateOrderCode() =>
        string.Concat(Enumerable.Range(0, 8)
            .Select(_ => OrderCodeAlphabet[RandomNumberGenerator.GetInt32(OrderCodeAlphabet.Length)]));

    private static AdminOrderSummary ReadConfirmedOrder(SqliteDataReader reader)
    {
        var storedTableNumber = reader.GetInt32(2);
        var confirmedAtValue = reader.IsDBNull(6) ? null : reader.GetString(6);
        return new AdminOrderSummary(
            reader.GetInt64(0),
            reader.GetString(1),
            storedTableNumber == 0 ? null : storedTableNumber,
            JsonSerializer.Deserialize<OrderLine[]>(reader.GetString(3), JsonOptions) ?? [],
            reader.GetInt32(4),
            DateTimeOffset.Parse(reader.GetString(5)),
            confirmedAtValue is null ? null : DateTimeOffset.Parse(confirmedAtValue),
            reader.IsDBNull(7) ? null : reader.GetString(7),
            reader.IsDBNull(8) ? null : reader.GetString(8));
    }
}
