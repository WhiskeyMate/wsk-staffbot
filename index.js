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
        .setName('reply')
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

    if (interaction.commandName === 'reply') {
        // Check if user has an allowed role
        if (!hasAllowedRole(interaction.member)) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true
            });
        }

        const channel = interaction.options.getChannel('channel');
        const message = interaction.options.getString('message');

        try {
            await channel.send(message);
            await interaction.reply({
                content: `Message sent to ${channel}`,
                ephemeral: true
            });
        } catch (error) {
            console.error('Error sending message:', error);
            await interaction.reply({
                content: `Failed to send message. Make sure I have permission to send messages in ${channel}.`,
                ephemeral: true
            });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
