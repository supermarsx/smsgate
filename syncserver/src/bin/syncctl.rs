//! syncctl - CLI admin companion for syncserver.
//! Provides convenient wrappers around core admin APIs (login, users, numbers,
//! devices, config) so operators can script common tasks without wiring HTTP calls.

use std::{path::PathBuf, process::exit};

use clap::{Args, Parser, Subcommand};
use reqwest::{Client, Method};
use serde_json::Value;

/// Top-level CLI definition.
#[derive(Debug, Parser)]
#[command(name = "syncctl", about = "Admin CLI for syncserver")]
struct Cli {
    /// Base URL of the running syncserver instance.
    #[arg(long, default_value = "http://127.0.0.1:8080")]
    base_url: String,
    /// Session token used for authenticated admin calls.
    #[arg(long, env = "SYNCCTL_TOKEN")]
    token: Option<String>,
    #[command(subcommand)]
    command: Commands,
}

#[derive(Debug, Subcommand)]
enum Commands {
    /// Obtain a session token via auth.login.
    Login(LoginArgs),
    /// Read or patch configuration via admin APIs.
    Config(ConfigCmd),
    /// Manage users via admin APIs.
    User(UserCmd),
    /// Manage numbers via admin APIs.
    Number(NumberCmd),
    /// Manage devices via admin APIs.
    Device(DeviceCmd),
}

#[derive(Debug, Args)]
struct LoginArgs {
    /// Auth mode: simple_signin | domain_signin | oauth
    #[arg(long, default_value = "simple_signin")]
    mode: String,
    /// Username / subject.
    #[arg(long)]
    username: String,
    /// Password (required for simple/domain).
    #[arg(long)]
    password: Option<String>,
    /// TOTP code for admin (optional).
    #[arg(long)]
    totp: Option<String>,
    /// Raw ID token for oauth mode.
    #[arg(long)]
    id_token: Option<String>,
}

#[derive(Debug, Subcommand)]
enum ConfigCmd {
    /// Fetch the current effective config snapshot.
    Get,
    /// Apply a JSON patch document from file.
    Patch {
        /// Path to JSON patch payload.
        #[arg(long)]
        file: PathBuf,
    },
}

#[derive(Debug, Subcommand)]
enum UserCmd {
    /// List users (paginated).
    List {
        #[arg(long, default_value_t = 1)]
        page: u32,
        #[arg(long, default_value_t = 50)]
        page_size: u32,
    },
    /// Create a new user.
    Create {
        #[arg(long)]
        username: String,
        #[arg(long)]
        password: String,
        #[arg(long)]
        role: String,
        #[arg(long)]
        totp_secret: Option<String>,
    },
    /// Unlock a user account.
    Unlock {
        #[arg(long)]
        user_id: String,
    },
    /// Force logout a user (revokes sessions).
    ForceLogout {
        #[arg(long)]
        user_id: String,
    },
    /// Delete a user.
    Delete {
        #[arg(long)]
        user_id: String,
    },
}

#[derive(Debug, Subcommand)]
enum NumberCmd {
    /// List provisioned numbers.
    List {
        #[arg(long, default_value_t = 1)]
        page: u32,
        #[arg(long, default_value_t = 50)]
        page_size: u32,
    },
    /// Create a number.
    Create {
        e164: String,
        #[arg(long)]
        label: Option<String>,
        #[arg(long, default_value_t = false)]
        shared: bool,
        #[arg(long)]
        default_device_id: Option<String>,
    },
    /// Assign a number to a device.
    Assign { e164: String, device_id: String },
    /// Unassign a number from a device.
    Unassign { e164: String, device_id: String },
}

#[derive(Debug, Subcommand)]
enum DeviceCmd {
    /// List registered devices.
    List,
    /// Rename a device.
    Rename { device_id: String, name: String },
    /// Enable a device.
    Enable { device_id: String },
    /// Disable a device with optional reason.
    Disable {
        device_id: String,
        #[arg(long)]
        reason: Option<String>,
    },
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    let cli = Cli::parse();
    let client = Client::builder().build()?;

    match cli.command {
        Commands::Login(args) => login(&client, &cli.base_url, args).await?,
        Commands::Config(cmd) => config_cmd(&client, &cli, cmd).await?,
        Commands::User(cmd) => user_cmd(&client, &cli, cmd).await?,
        Commands::Number(cmd) => number_cmd(&client, &cli, cmd).await?,
        Commands::Device(cmd) => device_cmd(&client, &cli, cmd).await?,
    }

    Ok(())
}

async fn login(
    client: &Client,
    base: &str,
    args: LoginArgs,
) -> Result<(), Box<dyn std::error::Error>> {
    let url = format!("{}/api/v1/auth/login", base);
    let body = serde_json::json!({
        "mode": args.mode,
        "username": args.username,
        "password": args.password,
        "totp_code": args.totp,
        "id_token": args.id_token
    });
    let res = client
        .post(url)
        .json(&body)
        .send()
        .await?
        .error_for_status()?
        .json::<Value>()
        .await?;
    println!("{}", serde_json::to_string_pretty(&res)?);
    if let Some(token) = res.get("session_token").and_then(|v| v.as_str()) {
        println!("\nexport SYNCCTL_TOKEN={}", token);
    }
    Ok(())
}

async fn config_cmd(
    client: &Client,
    cli: &Cli,
    cmd: ConfigCmd,
) -> Result<(), Box<dyn std::error::Error>> {
    match cmd {
        ConfigCmd::Get => {
            let url = format!("{}/api/v1/config", cli.base_url);
            let body = authed_request(client, Method::GET, url, cli.token.as_deref(), None).await?;
            println!("{}", serde_json::to_string_pretty(&body)?);
        }
        ConfigCmd::Patch { file } => {
            let data = std::fs::read_to_string(&file)?;
            let json: Value = serde_json::from_str(&data)?;
            let url = format!("{}/api/v1/config", cli.base_url);
            let body = authed_request(client, Method::PATCH, url, cli.token.as_deref(), Some(json))
                .await?;
            println!("{}", serde_json::to_string_pretty(&body)?);
        }
    }
    Ok(())
}

async fn user_cmd(
    client: &Client,
    cli: &Cli,
    cmd: UserCmd,
) -> Result<(), Box<dyn std::error::Error>> {
    match cmd {
        UserCmd::List { page, page_size } => {
            let url = format!(
                "{}/api/v1/admin/users?page={}&page_size={}",
                cli.base_url, page, page_size
            );
            let body = authed_request(client, Method::GET, url, cli.token.as_deref(), None).await?;
            println!("{}", serde_json::to_string_pretty(&body)?);
        }
        UserCmd::Create {
            username,
            password,
            role,
            totp_secret,
        } => {
            let url = format!("{}/api/v1/admin/users", cli.base_url);
            let payload = serde_json::json!({
                "username": username,
                "password": password,
                "role": role,
                "totp_secret": totp_secret
            });
            let body = authed_request(
                client,
                Method::POST,
                url,
                cli.token.as_deref(),
                Some(payload),
            )
            .await?;
            println!("{}", serde_json::to_string_pretty(&body)?);
        }
        UserCmd::Unlock { user_id } => {
            let url = format!("{}/api/v1/admin/users/{}/unlock", cli.base_url, user_id);
            let body = authed_request(
                client,
                Method::POST,
                url,
                cli.token.as_deref(),
                Some(serde_json::json!({})),
            )
            .await?;
            println!("{}", serde_json::to_string_pretty(&body)?);
        }
        UserCmd::ForceLogout { user_id } => {
            let url = format!(
                "{}/api/v1/admin/users/{}/force_logout",
                cli.base_url, user_id
            );
            let body = authed_request(
                client,
                Method::POST,
                url,
                cli.token.as_deref(),
                Some(serde_json::json!({})),
            )
            .await?;
            println!("{}", serde_json::to_string_pretty(&body)?);
        }
        UserCmd::Delete { user_id } => {
            let url = format!("{}/api/v1/admin/users/{}", cli.base_url, user_id);
            authed_request(client, Method::DELETE, url, cli.token.as_deref(), None).await?;
            println!("deleted {}", user_id);
        }
    }
    Ok(())
}

async fn number_cmd(
    client: &Client,
    cli: &Cli,
    cmd: NumberCmd,
) -> Result<(), Box<dyn std::error::Error>> {
    match cmd {
        NumberCmd::List { page, page_size } => {
            let url = format!(
                "{}/api/v1/admin/numbers?page={}&page_size={}",
                cli.base_url, page, page_size
            );
            let body = authed_request(client, Method::GET, url, cli.token.as_deref(), None).await?;
            println!("{}", serde_json::to_string_pretty(&body)?);
        }
        NumberCmd::Create {
            e164,
            label,
            shared,
            default_device_id,
        } => {
            let url = format!("{}/api/v1/admin/numbers", cli.base_url);
            let payload = serde_json::json!({
                "e164": e164,
                "label": label,
                "shared": shared,
                "default_device_id": default_device_id
            });
            let body = authed_request(
                client,
                Method::POST,
                url,
                cli.token.as_deref(),
                Some(payload),
            )
            .await?;
            println!("{}", serde_json::to_string_pretty(&body)?);
        }
        NumberCmd::Assign { e164, device_id } => {
            let url = format!("{}/api/v1/admin/numbers/{}/assign", cli.base_url, e164);
            let payload = serde_json::json!({ "device_id": device_id });
            let body = authed_request(
                client,
                Method::POST,
                url,
                cli.token.as_deref(),
                Some(payload),
            )
            .await?;
            println!("{}", serde_json::to_string_pretty(&body)?);
        }
        NumberCmd::Unassign { e164, device_id } => {
            let url = format!("{}/api/v1/admin/numbers/{}/unassign", cli.base_url, e164);
            let payload = serde_json::json!({ "device_id": device_id });
            let body = authed_request(
                client,
                Method::POST,
                url,
                cli.token.as_deref(),
                Some(payload),
            )
            .await?;
            println!("{}", serde_json::to_string_pretty(&body)?);
        }
    }
    Ok(())
}

async fn device_cmd(
    client: &Client,
    cli: &Cli,
    cmd: DeviceCmd,
) -> Result<(), Box<dyn std::error::Error>> {
    match cmd {
        DeviceCmd::List => {
            let url = format!("{}/api/v1/devices", cli.base_url);
            let body = authed_request(client, Method::GET, url, cli.token.as_deref(), None).await?;
            println!("{}", serde_json::to_string_pretty(&body)?);
        }
        DeviceCmd::Rename { device_id, name } => {
            let url = format!("{}/api/v1/devices/{}/rename", cli.base_url, device_id);
            let payload = serde_json::json!({ "name": name });
            let body = authed_request(
                client,
                Method::POST,
                url,
                cli.token.as_deref(),
                Some(payload),
            )
            .await?;
            println!("{}", serde_json::to_string_pretty(&body)?);
        }
        DeviceCmd::Enable { device_id } => {
            let url = format!("{}/api/v1/devices/{}/enable", cli.base_url, device_id);
            let body = authed_request(
                client,
                Method::POST,
                url,
                cli.token.as_deref(),
                Some(serde_json::json!({})),
            )
            .await?;
            println!("{}", serde_json::to_string_pretty(&body)?);
        }
        DeviceCmd::Disable { device_id, reason } => {
            let url = format!("{}/api/v1/devices/{}/disable", cli.base_url, device_id);
            let payload = serde_json::json!({ "reason": reason });
            let body = authed_request(
                client,
                Method::POST,
                url,
                cli.token.as_deref(),
                Some(payload),
            )
            .await?;
            println!("{}", serde_json::to_string_pretty(&body)?);
        }
    }
    Ok(())
}

/// Helper to perform an authenticated JSON request.
async fn authed_request(
    client: &Client,
    method: Method,
    url: String,
    token: Option<&str>,
    body: Option<Value>,
) -> Result<Value, Box<dyn std::error::Error>> {
    let token = token.unwrap_or_else(|| {
        eprintln!("missing session token (pass --token or set SYNCCTL_TOKEN)");
        exit(1);
    });
    let mut req = client.request(method, url).bearer_auth(token);
    if let Some(json) = body {
        req = req.json(&json);
    }
    let res = req
        .send()
        .await?
        .error_for_status()?
        .json::<Value>()
        .await?;
    Ok(res)
}
