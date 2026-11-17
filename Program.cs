using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Threading.RateLimiting;
using System.Net;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using QRCoder;

var builder = WebApplication.CreateBuilder(args);
var connectionString = $"Data Source={Path.Combine(builder.Environment.ContentRootPath, "data", "orders.db")}";
var orderStore = new OrderStore(connectionString);
var menuStore = new MenuStore(connectionString);
var staffStore = new StaffAccountStore(connectionString);
var siteSettingsStore = new SiteSettingsStore(connectionString);
var adminProfileStore = new AdminProfileStore(connectionString);
var adminUsername = builder.Configuration["Admin:Username"]?.Trim();
var adminPassword = builder.Configuration["Admin:Password"];
const int adminPasswordIterations = 150_000;
var initialStaffPin = builder.Configuration["Staff:Pin"];
var publicBaseUrl = builder.Configuration["PublicBaseUrl"]?.TrimEnd('/');
var trustedProxyAddresses = new List<IPAddress>();
foreach (var value in builder.Configuration.GetSection("ReverseProxy:KnownProxies").Get<string[]>() ?? [])
{
    if (!IPAddress.TryParse(value, out var address))
    {
        throw new InvalidOperationException($"Invalid reverse proxy IP address: {value}");
    }

    trustedProxyAddresses.Add(address);
}

if (string.IsNullOrWhiteSpace(adminUsername))
{
    if (builder.Environment.IsProduction())
    {
        throw new InvalidOperationException("Set the Admin__Username environment variable before running in production.");
    }

    adminUsername = "admin";
}

if (string.IsNullOrWhiteSpace(adminPassword))
{
    if (builder.Environment.IsProduction())
    {
        throw new InvalidOperationException("Set the Admin__Password environment variable before running in production.");
    }

    adminPassword = builder.Configuration["Admin:Pin"] ?? "9999";
}

if (adminUsername.Length > 80 ||
    adminPassword.Length > 128 ||
    (builder.Environment.IsProduction() && adminPassword.Length < 12))
{
    throw new InvalidOperationException("The admin username must be at most 80 characters, and the production password must be 12 to 128 characters.");
}

if (string.IsNullOrWhiteSpace(initialStaffPin) && !builder.Environment.IsProduction())
{
    initialStaffPin = "2468";
}

if (!string.IsNullOrWhiteSpace(initialStaffPin) && IsValidPin(initialStaffPin, adminPassword))
{
    throw new InvalidOperationException("The staff PIN must not match the admin password.");
}

if (builder.Environment.IsProduction() && string.IsNullOrWhiteSpace(publicBaseUrl))
{
    throw new InvalidOperationException("Set the PublicBaseUrl environment variable before running in production.");
}

if (!string.IsNullOrWhiteSpace(publicBaseUrl) &&
    (!Uri.TryCreate(publicBaseUrl, UriKind.Absolute, out var configuredUri) ||
     configuredUri.Scheme is not ("http" or "https") ||
     (builder.Environment.IsProduction() && configuredUri.Scheme != "https")))
{
    throw new InvalidOperationException("PublicBaseUrl must be an absolute HTTP or HTTPS URL, and HTTPS in production.");
}

builder.Services
    .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.Name = "restaurant.staff";
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.Strict;
        options.Cookie.SecurePolicy = builder.Environment.IsProduction()
            ? CookieSecurePolicy.Always
            : CookieSecurePolicy.SameAsRequest;
        options.ExpireTimeSpan = TimeSpan.FromHours(8);
        options.SlidingExpiration = true;
        options.Events.OnRedirectToLogin = context =>
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return Task.CompletedTask;
        };
        options.Events.OnRedirectToAccessDenied = context =>
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return Task.CompletedTask;
        };
    });
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    foreach (var address in trustedProxyAddresses)
    {
        options.KnownProxies.Add(address);
    }
});
builder.Services.AddHsts(options =>
{
    options.MaxAge = TimeSpan.FromDays(365);
    options.IncludeSubDomains = false;
    options.Preload = false;
});
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("StaffOnly", policy => policy.RequireRole("staff"));
    options.AddPolicy("AdminOnly", policy => policy.RequireRole("admin"));
});
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("staff-pin-change", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 5,
                Window = TimeSpan.FromMinutes(10),
                QueueLimit = 0
            }));
    options.AddPolicy("staff-login", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 5,
                Window = TimeSpan.FromMinutes(10),
                QueueLimit = 0
            }));
    options.AddPolicy("admin-login", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 5,
                Window = TimeSpan.FromMinutes(10),
                QueueLimit = 0
            }));
    options.AddPolicy("new-order", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));
});

var app = builder.Build();
await orderStore.InitializeAsync();
await menuStore.InitializeAsync();
await staffStore.InitializeAsync();
await siteSettingsStore.InitializeAsync();
await adminProfileStore.InitializeAsync("مدير سفرة", adminPassword, adminPasswordIterations);
if (!string.IsNullOrWhiteSpace(initialStaffPin))
{
    await staffStore.SeedIfEmptyAsync("موظف تجريبي", initialStaffPin);
}

app.UseForwardedHeaders();
if (app.Environment.IsProduction())
{
    app.Use(async (context, next) =>
    {
        if (!context.Request.IsHttps)
        {
            context.Response.StatusCode = StatusCodes.Status426UpgradeRequired;
            context.Response.Headers.CacheControl = "no-store";
            await context.Response.WriteAsync("HTTPS is required.");
            return;
        }

        await next();
    });
    app.UseHsts();
}

app.UseDefaultFiles();
app.UseStaticFiles();
app.UseRouting();
app.UseRateLimiter();
app.UseAuthentication();
app.Use(async (context, next) =>
{
    if (context.User.IsInRole("staff"))
    {
        var idClaim = context.User.FindFirstValue("staffId");
        var versionClaim = context.User.FindFirstValue("staffVersion");
        if (!long.TryParse(idClaim, out var staffId) ||
            !int.TryParse(versionClaim, out var authVersion) ||
            !await staffStore.IsSessionValidAsync(staffId, authVersion))
        {
            await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return;
        }
    }
    else if (context.User.IsInRole("admin"))
    {
        var versionClaim = context.User.FindFirstValue("adminVersion");
        if (!int.TryParse(versionClaim, out var authVersion) ||
            !await adminProfileStore.IsSessionValidAsync(authVersion))
        {
            await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return;
        }
    }

    await next();
});
app.UseAuthorization();

app.MapGet("/api/menu", async () => Results.Ok(await menuStore.GetAvailableAsync()));
app.MapGet("/api/site-settings", async () => Results.Ok(await siteSettingsStore.GetAsync()));

app.MapPost("/api/orders", async (CreateOrderRequest request) =>
{
    if (request is null ||
        string.IsNullOrWhiteSpace(request.CustomerName) ||
        request.CustomerName.Trim().Length > 80 ||
        request.TableNumber is < 1 or > 200 ||
        request.Items is null ||
        request.Items.Count is < 1 or > 20 ||
        request.Items.Any(item =>
            item is null ||
            item.Quantity is < 1 or > 10 ||
            string.IsNullOrEmpty(item.Id)) ||
        request.Items.GroupBy(item => item.Id, StringComparer.Ordinal).Any(group => group.Sum(item => item.Quantity) > 10))
    {
        return Results.BadRequest(new { message = "تحقق من الاسم والأطباق المختارة." });
    }

    var order = await orderStore.CreateAsync(
        request.CustomerName.Trim(),
        request.TableNumber,
        request.Items);
    if (order is null)
    {
        return Results.BadRequest(new { message = "أحد الأطباق لم يعد متاحًا. حدّث القائمة ثم حاول مجددًا." });
    }

    var qrPayload = $"/order/{order.Token}";
    using var generator = new QRCodeGenerator();
    using var qrData = generator.CreateQrCode(qrPayload, QRCodeGenerator.ECCLevel.M);
    var qrBytes = new PngByteQRCode(qrData).GetGraphic(8);

    return Results.Created($"/api/orders/{order.Token}", new
    {
        order.Id,
        order.Token,
        order.CustomerName,
        order.TableNumber,
        order.Items,
        order.Total,
        order.Status,
        order.CreatedAt,
        QrDataUrl = $"data:image/png;base64,{Convert.ToBase64String(qrBytes)}",
        OrderUrl = qrPayload
    });
}).RequireRateLimiting("new-order");

app.MapGet("/api/orders/{token}", async (string token) =>
{
    var order = await orderStore.GetByTokenAsync(token);
    return order is null
        ? Results.NotFound(new { message = "لم يتم العثور على هذا الطلب." })
        : Results.Ok(order);
});

app.MapPost("/api/staff/login", async (StaffLoginRequest? request, HttpContext context) =>
{
    var staff = string.IsNullOrWhiteSpace(request?.Pin)
        ? null
        : await staffStore.FindActiveByPinAsync(request.Pin);
    if (staff is null)
    {
        await Task.Delay(RandomNumberGenerator.GetInt32(150, 351));
        return Results.Unauthorized();
    }

    var identity = new ClaimsIdentity(
        [
            new Claim(ClaimTypes.Name, staff.Name),
            new Claim(ClaimTypes.Role, "staff"),
            new Claim("staffId", staff.Id.ToString()),
            new Claim("staffVersion", staff.AuthVersion.ToString())
        ],
        CookieAuthenticationDefaults.AuthenticationScheme);
    await context.SignInAsync(
        CookieAuthenticationDefaults.AuthenticationScheme,
        new ClaimsPrincipal(identity));
    return Results.Ok(new { authenticated = true });
}).RequireRateLimiting("staff-login");

app.MapGet("/api/staff/me", async (ClaimsPrincipal user) =>
{
    var staffId = GetStaffId(user);
    if (staffId is null)
    {
        return Results.Unauthorized();
    }

    var profile = await staffStore.GetProfileAsync(staffId.Value);
    return profile is null
        ? Results.NotFound(new { message = "حساب الموظف غير موجود." })
        : Results.Ok(new { authenticated = true, name = profile.Name, profile.AvatarData });
}).RequireAuthorization("StaffOnly");

app.MapGet("/api/staff/profile", async (ClaimsPrincipal user) =>
{
    var staffId = GetStaffId(user);
    if (staffId is null)
    {
        return Results.Unauthorized();
    }

    var profile = await staffStore.GetProfileAsync(staffId.Value);
    return profile is null
        ? Results.NotFound(new { message = "حساب الموظف غير موجود." })
        : Results.Ok(profile);
}).RequireAuthorization("StaffOnly");

app.MapPut("/api/staff/profile", async (StaffProfileUpdateRequest? request, ClaimsPrincipal user) =>
{
    if (request is null ||
        string.IsNullOrWhiteSpace(request.Name) ||
        request.Name.Trim().Length > 80 ||
        (request.AvatarData is not null && !IsValidMenuImage(request.AvatarData)) ||
        (request.RemoveAvatar && request.AvatarData is not null))
    {
        return Results.BadRequest(new { message = "تحقق من الاسم الكامل وصورة الملف الشخصي." });
    }

    var staffId = GetStaffId(user);
    if (staffId is null)
    {
        return Results.Unauthorized();
    }

    var profile = await staffStore.UpdateProfileAsync(
        staffId.Value,
        request.Name.Trim(),
        request.AvatarData,
        request.RemoveAvatar);
    return profile is null
        ? Results.NotFound(new { message = "حساب الموظف غير موجود." })
        : Results.Ok(profile);
}).RequireAuthorization("StaffOnly");

app.MapPut("/api/staff/pin", async (StaffPinChangeRequest? request, ClaimsPrincipal user, HttpContext context) =>
{
    if (request is null ||
        request.CurrentPin is not { Length: > 0 and <= 128 } ||
        !IsValidEmployeePin(request.NewPin) ||
        string.Equals(request.CurrentPin, request.NewPin, StringComparison.Ordinal))
    {
        return Results.BadRequest(new { message = "أدخل الرمز الحالي ورمزًا جديدًا مختلفًا من 6 إلى 12 رقمًا." });
    }

    var staffId = GetStaffId(user);
    if (staffId is null)
    {
        return Results.Unauthorized();
    }

    var adminCredentials = await adminProfileStore.GetCredentialsAsync();
    if (IsValidAdminPassword(
        request.NewPin,
        adminCredentials.PasswordSalt,
        adminCredentials.PasswordHash,
        adminCredentials.PasswordIterations))
    {
        return Results.Conflict(new { message = "لا يمكن استخدام رمز دخول المدير." });
    }

    var result = await staffStore.ChangePinAsync(staffId.Value, request.CurrentPin, request.NewPin!);
    if (result == StaffPinChangeResult.Changed)
    {
        await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return Results.NoContent();
    }

    return result switch
    {
        StaffPinChangeResult.InvalidCurrentPin =>
            Results.BadRequest(new { message = "رمز الدخول الحالي غير صحيح." }),
        StaffPinChangeResult.PinAlreadyUsed =>
            Results.Conflict(new { message = "رمز الدخول الجديد مستخدم لحساب موظف آخر." }),
        StaffPinChangeResult.Inactive =>
            Results.Unauthorized(),
        _ => Results.NotFound(new { message = "حساب الموظف غير موجود." })
    };
}).RequireAuthorization("StaffOnly").RequireRateLimiting("staff-pin-change");

app.MapGet("/api/staff/menu-qr", (HttpContext context) => CreateMenuQr(context, publicBaseUrl))
    .RequireAuthorization("StaffOnly");

app.MapPost("/api/staff/logout", async (HttpContext context) =>
{
    await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    return Results.NoContent();
}).RequireAuthorization("StaffOnly");

app.MapGet("/api/staff/orders/{token}", async (string token) =>
{
    var order = await orderStore.GetByTokenAsync(token);
    return order is null
        ? Results.NotFound(new { message = "لم يتم العثور على هذا الطلب. تحقق من الرمز." })
        : Results.Ok(order);
}).RequireAuthorization("StaffOnly");

app.MapPost("/api/staff/orders/{token}/confirm", async (string token) =>
{
    var result = await orderStore.ConfirmAsync(token);
    return result switch
    {
        ConfirmResult.Confirmed => Results.Ok(new { status = "confirmed" }),
        ConfirmResult.AlreadyConfirmed => Results.Conflict(new { message = "تم تأكيد هذا الطلب مسبقًا." }),
        _ => Results.NotFound(new { message = "لم يتم العثور على هذا الطلب." })
    };
}).RequireAuthorization("StaffOnly");

app.MapPost("/api/admin/login", async (AdminLoginRequest? request, HttpContext context) =>
{
    var credentials = await adminProfileStore.GetCredentialsAsync();
    if (!IsValidAdminCredentials(
        request?.Username,
        request?.Password,
        adminUsername,
        credentials.PasswordSalt,
        credentials.PasswordHash,
        credentials.PasswordIterations))
    {
        await Task.Delay(RandomNumberGenerator.GetInt32(150, 351));
        return Results.Unauthorized();
    }

    var identity = new ClaimsIdentity(
        [
            new Claim(ClaimTypes.Name, adminUsername),
            new Claim(ClaimTypes.Role, "admin"),
            new Claim("adminVersion", credentials.AuthVersion.ToString(System.Globalization.CultureInfo.InvariantCulture))
        ],
        CookieAuthenticationDefaults.AuthenticationScheme);
    await context.SignInAsync(
        CookieAuthenticationDefaults.AuthenticationScheme,
        new ClaimsPrincipal(identity));
    return Results.Ok(new { authenticated = true });
}).RequireRateLimiting("admin-login");

app.MapGet("/api/admin/me", () => Results.Ok(new { authenticated = true }))
    .RequireAuthorization("AdminOnly");

app.MapGet("/api/admin/profile", async () =>
    Results.Ok(await adminProfileStore.GetProfileAsync()))
    .RequireAuthorization("AdminOnly");

app.MapPut("/api/admin/profile", async (AdminProfileUpdateRequest? request) =>
{
    if (request is null ||
        string.IsNullOrWhiteSpace(request.DisplayName) ||
        request.DisplayName.Trim().Length > 80 ||
        (request.AvatarData is not null && !IsValidMenuImage(request.AvatarData)) ||
        (request.RemoveAvatar && request.AvatarData is not null))
    {
        return Results.BadRequest(new { message = "تحقق من الاسم وصورة الملف الشخصي." });
    }

    await adminProfileStore.UpdateProfileAsync(
        request.DisplayName.Trim(),
        request.AvatarData,
        request.RemoveAvatar);
    return Results.Ok(await adminProfileStore.GetProfileAsync());
}).RequireAuthorization("AdminOnly");

app.MapPut("/api/admin/password", async (AdminPasswordChangeRequest? request, HttpContext context) =>
{
    if (request is null ||
        request.CurrentPassword is not { Length: > 0 and <= 128 } ||
        request.NewPassword is not { Length: >= 12 and <= 128 } ||
        string.Equals(request.CurrentPassword, request.NewPassword, StringComparison.Ordinal))
    {
        return Results.BadRequest(new { message = "أدخل كلمة المرور الحالية وكلمة جديدة من 12 إلى 128 حرفًا، مختلفة عنها." });
    }

    var credentials = await adminProfileStore.GetCredentialsAsync();
    if (!IsValidAdminPassword(
        request.CurrentPassword,
        credentials.PasswordSalt,
        credentials.PasswordHash,
        credentials.PasswordIterations))
    {
        return Results.BadRequest(new { message = "كلمة المرور الحالية غير صحيحة." });
    }
    if (IsValidEmployeePin(request.NewPassword) &&
        await staffStore.IsPinTakenAsync(request.NewPassword))
    {
        return Results.BadRequest(new { message = "لا يمكن استخدام رمز دخول أحد الموظفين ككلمة مرور للمدير." });
    }

    var salt = RandomNumberGenerator.GetBytes(16);
    var hash = Rfc2898DeriveBytes.Pbkdf2(
        request.NewPassword,
        salt,
        adminPasswordIterations,
        HashAlgorithmName.SHA256,
        32);
    await adminProfileStore.ChangePasswordAsync(salt, hash, adminPasswordIterations);
    await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    return Results.NoContent();
}).RequireAuthorization("AdminOnly");

app.MapPut("/api/admin/site-settings", async (SiteSettingsRequest? request) =>
{
    if (request is null ||
        !IsValidSiteTheme(request.Theme) ||
        string.IsNullOrWhiteSpace(request.SiteName) ||
        request.SiteName.Trim().Length > 80 ||
        (request.LogoData is not null && !IsValidMenuImage(request.LogoData)) ||
        (request.RemoveLogo && request.LogoData is not null))
    {
        return Results.BadRequest(new { message = "تحقق من اسم الموقع والثيم والشعار." });
    }

    await siteSettingsStore.UpdateAsync(
        request.Theme!,
        request.SiteName.Trim(),
        request.LogoData,
        request.RemoveLogo);
    return Results.Ok(await siteSettingsStore.GetAsync());
}).RequireAuthorization("AdminOnly");

app.MapPost("/api/admin/logout", async (HttpContext context) =>
{
    await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    return Results.NoContent();
}).RequireAuthorization("AdminOnly");

app.MapGet("/api/admin/menu", async () =>
    Results.Ok(await menuStore.GetAllAsync()))
    .RequireAuthorization("AdminOnly");

app.MapGet("/api/admin/menu-qr", (HttpContext context) => CreateMenuQr(context, publicBaseUrl))
    .RequireAuthorization("AdminOnly");

app.MapPost("/api/admin/menu", async (MenuItemRequest? request) =>
{
    if (!IsValidMenuItem(request) || !IsValidMenuImage(request?.ImageData))
    {
        return Results.BadRequest(new { message = "أدخل بيانات الطبق واختر صورة بصيغة JPG أو PNG أو WebP، وسعرًا بين 1 و1,000,000 درهم." });
    }

    var menuItem = await menuStore.CreateAsync(request!);
    return Results.Created($"/api/admin/menu/{menuItem.Id}", menuItem);
}).RequireAuthorization("AdminOnly");

app.MapPut("/api/admin/menu/{id}", async (string id, MenuItemRequest? request) =>
{
    if (!IsValidMenuItem(request) ||
        (request!.ImageData is not null && !IsValidMenuImage(request.ImageData)))
    {
        return Results.BadRequest(new { message = "تحقق من بيانات الطبق والسعر والصورة." });
    }

    var menuItem = await menuStore.UpdateAsync(id, request!);
    return menuItem is null
        ? Results.NotFound(new { message = "الطبق غير موجود." })
        : Results.Ok(menuItem);
}).RequireAuthorization("AdminOnly");

app.MapDelete("/api/admin/menu/{id}", async (string id) =>
    await menuStore.DeleteAsync(id)
        ? Results.NoContent()
        : Results.NotFound(new { message = "الطبق غير موجود." }))
    .RequireAuthorization("AdminOnly");

app.MapGet("/api/admin/staff", async () =>
    Results.Ok(await staffStore.GetAllAsync()))
    .RequireAuthorization("AdminOnly");

app.MapPost("/api/admin/staff", async (CreateStaffRequest? request) =>
{
    if (request is null ||
        string.IsNullOrWhiteSpace(request.Name) ||
        request.Name.Trim().Length > 80 ||
        !IsValidEmployeePin(request.Pin))
    {
        return Results.BadRequest(new { message = "أدخل اسمًا ورمز موظف مكوّنًا من 6 إلى 12 رقمًا." });
    }

    var adminCredentials = await adminProfileStore.GetCredentialsAsync();
    if (IsValidAdminPassword(
            request.Pin,
            adminCredentials.PasswordSalt,
            adminCredentials.PasswordHash,
            adminCredentials.PasswordIterations) ||
        await staffStore.IsPinTakenAsync(request.Pin!))
    {
        return Results.Conflict(new { message = "رمز الدخول مستخدم بالفعل أو يطابق كلمة مرور المدير." });
    }

    var staff = await staffStore.CreateAsync(request.Name.Trim(), request.Pin!);
    return Results.Created($"/api/admin/staff/{staff.Id}", staff);
}).RequireAuthorization("AdminOnly");

app.MapPut("/api/admin/staff/{id:long}", async (long id, UpdateStaffRequest? request) =>
{
    if (id < 1 || request is null || string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length > 80)
    {
        return Results.BadRequest(new { message = "تحقق من اسم الموظف." });
    }

    var newPin = string.IsNullOrWhiteSpace(request.NewPin) ? null : request.NewPin;
    if (newPin is not null && !IsValidEmployeePin(newPin))
    {
        return Results.Conflict(new { message = "رمز الموظف الجديد غير صالح أو مستخدم بالفعل." });
    }
    if (newPin is not null)
    {
        var adminCredentials = await adminProfileStore.GetCredentialsAsync();
        if (IsValidAdminPassword(
                newPin,
                adminCredentials.PasswordSalt,
                adminCredentials.PasswordHash,
                adminCredentials.PasswordIterations) ||
            await staffStore.IsPinTakenAsync(newPin, id))
        {
            return Results.Conflict(new { message = "رمز الموظف الجديد غير صالح أو مستخدم بالفعل." });
        }
    }

    var staff = await staffStore.UpdateAsync(id, request.Name.Trim(), request.IsActive, newPin);
    return staff is null
        ? Results.NotFound(new { message = "الموظف غير موجود." })
        : Results.Ok(staff);
}).RequireAuthorization("AdminOnly");

app.MapDelete("/api/admin/staff/{id:long}", async (long id) =>
    await staffStore.SetActiveAsync(id, false)
        ? Results.NoContent()
        : Results.NotFound(new { message = "الموظف غير موجود." }))
    .RequireAuthorization("AdminOnly");

app.MapGet("/api/admin/orders", async () =>
    Results.Ok(await orderStore.GetRecentAsync(200)))
    .RequireAuthorization("AdminOnly");

app.MapFallbackToFile("index.html");
app.Run();

static bool IsValidPin(string? candidate, string expected)
{
    if (string.IsNullOrEmpty(candidate) || candidate.Length > 128)
    {
        return false;
    }

    var candidateHash = SHA256.HashData(Encoding.UTF8.GetBytes(candidate));
    var expectedHash = SHA256.HashData(Encoding.UTF8.GetBytes(expected));
    return CryptographicOperations.FixedTimeEquals(candidateHash, expectedHash);
}

static long? GetStaffId(ClaimsPrincipal user)
{
    var idClaim = user.FindFirstValue("staffId");
    return long.TryParse(idClaim, out var staffId) && staffId > 0 ? staffId : null;
}

static bool IsValidAdminCredentials(
    string? candidateUsername,
    string? candidatePassword,
    string expectedUsername,
    byte[] salt,
    byte[] expectedPasswordHash,
    int iterations)
{
    var usernameMatches =
        !string.IsNullOrWhiteSpace(candidateUsername) &&
        candidateUsername.Length <= 80 &&
        string.Equals(candidateUsername, expectedUsername, StringComparison.Ordinal);
    var passwordMatches = IsValidAdminPassword(candidatePassword, salt, expectedPasswordHash, iterations);
    return usernameMatches && passwordMatches;
}

static bool IsValidAdminPassword(
    string? candidatePassword,
    byte[] salt,
    byte[] expectedPasswordHash,
    int iterations)
{
    var passwordLengthIsValid = candidatePassword is { Length: > 0 and <= 128 };
    var candidatePasswordHash = Rfc2898DeriveBytes.Pbkdf2(
        passwordLengthIsValid ? candidatePassword! : "",
        salt,
        iterations,
        HashAlgorithmName.SHA256,
        expectedPasswordHash.Length);
    var passwordMatches = CryptographicOperations.FixedTimeEquals(candidatePasswordHash, expectedPasswordHash);
    return passwordLengthIsValid && passwordMatches;
}

static IResult CreateMenuQr(HttpContext context, string? publicBaseUrl)
{
    var menuUrl = string.IsNullOrWhiteSpace(publicBaseUrl)
        ? $"{context.Request.Scheme}://{context.Request.Host}{context.Request.PathBase}/"
        : $"{publicBaseUrl}/";
    using var generator = new QRCodeGenerator();
    using var qrData = generator.CreateQrCode(menuUrl, QRCodeGenerator.ECCLevel.M);
    var qrBytes = new PngByteQRCode(qrData).GetGraphic(10);
    return Results.Ok(new
    {
        MenuUrl = menuUrl,
        QrDataUrl = $"data:image/png;base64,{Convert.ToBase64String(qrBytes)}"
    });
}

static bool IsValidEmployeePin(string? pin) =>
    pin is { Length: >= 6 and <= 12 } && pin.All(char.IsAsciiDigit);

static bool IsValidSiteTheme(string? theme) =>
    theme is "sufra" or "sunset" or "ocean";

static bool IsValidMenuItem(MenuItemRequest? request) =>
    request is not null &&
    !string.IsNullOrWhiteSpace(request.Name) &&
    request.Name.Trim().Length <= 80 &&
    (request.Description?.Length ?? 0) <= 240 &&
    !string.IsNullOrWhiteSpace(request.Category) &&
    request.Category.Trim().Length <= 50 &&
    request.Price is > 0 and <= 1_000_000;

static bool IsValidMenuImage(string? imageData)
{
    const int maximumEncodedLength = 2_800_000;
    const int maximumImageBytes = 2_000_000;

    if (string.IsNullOrEmpty(imageData) || imageData.Length > maximumEncodedLength)
    {
        return false;
    }

    var separator = imageData.IndexOf(',');
    if (separator < 0)
    {
        return false;
    }

    var mediaType = imageData[..separator];
    if (mediaType is not ("data:image/jpeg;base64" or "data:image/png;base64" or "data:image/webp;base64"))
    {
        return false;
    }

    var encodedBytes = imageData[(separator + 1)..];
    var buffer = new byte[encodedBytes.Length];
    if (!Convert.TryFromBase64String(encodedBytes, buffer, out var bytesWritten) ||
        bytesWritten is 0 or > maximumImageBytes)
    {
        return false;
    }

    var bytes = buffer.AsSpan(0, bytesWritten);
    return mediaType switch
    {
        "data:image/jpeg;base64" =>
            bytes.Length >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF,
        "data:image/png;base64" =>
            bytes.StartsWith(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }),
        "data:image/webp;base64" =>
            bytes.Length >= 12 &&
            bytes[..4].SequenceEqual("RIFF"u8) &&
            bytes[8..12].SequenceEqual("WEBP"u8),
        _ => false
    };
}

public sealed record CreateOrderRequest(string CustomerName, int? TableNumber, List<OrderItemRequest> Items);
public sealed record OrderItemRequest(string Id, int Quantity);
public sealed record StaffLoginRequest(string? Pin);
public sealed record StaffProfileUpdateRequest(string? Name, string? AvatarData, bool RemoveAvatar = false);
public sealed record StaffPinChangeRequest(string? CurrentPin, string? NewPin);
public sealed record AdminLoginRequest(string? Username, string? Password);
public sealed record SiteSettingsRequest(string? Theme, string? SiteName, string? LogoData, bool RemoveLogo = false);
public sealed record AdminProfileUpdateRequest(string? DisplayName, string? AvatarData, bool RemoveAvatar = false);
public sealed record AdminPasswordChangeRequest(string? CurrentPassword, string? NewPassword);
public sealed record MenuItemRequest(string? Name, string? Description, string? Category, int Price, string? ImageData, bool IsAvailable = true);
public sealed record CreateStaffRequest(string? Name, string? Pin);
public sealed record UpdateStaffRequest(string? Name, bool IsActive, string? NewPin);
public sealed record MenuItem(string Id, string Name, string Description, string Category, int Price, string Emoji, bool IsAvailable, string? ImageData = null);
public sealed record StaffSummary(long Id, string Name, bool IsActive, DateTimeOffset CreatedAt);
public sealed record StaffIdentity(long Id, string Name, int AuthVersion);
public sealed record OrderLine(string Id, string Name, int Quantity, int UnitPrice, int Subtotal);
public sealed record OrderDetails(
    long Id,
    string Token,
    string CustomerName,
    int? TableNumber,
    IReadOnlyList<OrderLine> Items,
    int Total,
    string Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset? ConfirmedAt);
public sealed record AdminOrderSummary(
    long Id,
    string CustomerName,
    int? TableNumber,
    IReadOnlyList<OrderLine> Items,
    int Total,
    string Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset? ConfirmedAt);

public enum ConfirmResult
{
    Confirmed,
    AlreadyConfirmed,
    NotFound
}

