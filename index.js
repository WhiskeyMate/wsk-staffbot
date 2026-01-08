const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, ChannelType } = require('discord.js');
require('dotenv').config();

// Allowed role IDs - users must have at least one of these roles to use the command
const ALLOWED_ROLE_IDS = process.env.ALLOWED_ROLE_IDS?.split(',').map(id => id.trim()) || [];

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// Register slash commands
const commands = [
    new SlashCommandBuilder()
        .setName('say')
        .setDescription('Send a message to a channel as the bot (Staff only)')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel to send the message to')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('The message to send')
                .setRequired(true))
        .toJSON()
];

// Check if user has an allowed role
function hasAllowedRole(member) {
    if (ALLOWED_ROLE_IDS.length === 0) {
        console.warn('Warning: No ALLOWED_ROLE_IDS configured. Command will be denied to everyone.');
        return false;
    }
    return member.roles.cache.some(role => ALLOWED_ROLE_IDS.includes(role.id));
}

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    // Register commands globally (or use guildId for faster testing)
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('Registering slash commands...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('Slash commands registered!');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'say') {
        // Check if user has an allowed role
        if (!hasAllowedRole(interaction.member)) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true
            });
        }

        const channelOption = interaction.options.getChannel('channel');
        const message = interaction.options.getString('message');

        try {
            // Fetch the full channel object to ensure we have send permissions
            const channel = await client.channels.fetch(channelOption.id);

            if (!channel || !channel.isTextBased()) {
                return interaction.reply({
                    content: 'Invalid channel or channel is not a text channel.',
                    ephemeral: true
                });
            }

            // Check bot's permissions in this specific channel
            const botMember = interaction.guild.members.cache.get(client.user.id);
            const permissions = channel.permissionsFor(botMember);

            if (!permissions) {
                return interaction.reply({
                    content: `Cannot check permissions for ${channelOption}. The bot may not have access to view this channel.`,
                    ephemeral: true
                });
            }

            if (!permissions.has('ViewChannel')) {
                return interaction.reply({
                    content: `Bot cannot view ${channelOption}. Add the bot's role to this channel's permissions.`,
                    ephemeral: true
                });
            }

            if (!permissions.has('SendMessages')) {
                return interaction.reply({
                    content: `Bot cannot send messages in ${channelOption}. Add "Send Messages" permission for the bot's role in this channel.`,
                    ephemeral: true
                });
            }

            await channel.send(message);
            await interaction.reply({
                content: `Message sent to ${channelOption}`,
                ephemeral: true
            });
        } catch (error) {
            console.error('Error sending message:', error.message);
            console.error('Full error:', error);
            await interaction.reply({
                content: `Failed to send message: ${error.message}`,
                ephemeral: true
            });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
